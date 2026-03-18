const core = require('@actions/core');
const github = require('@actions/github');
const https = require('https');

const ZAI_API_URL = 'https://api.z.ai/api/coding/paas/v4/chat/completions';
const COMMENT_MARKER = '<!-- zai-code-review -->';
const ERR_PREFIX = 'Z.ai API: ';
const MAX_RESPONSE_SIZE = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 300_000;
const PER_PAGE = 100;
const MAX_CHUNK_SIZE = 50000;
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 8000,
};

async function getChangedFiles(octokit, owner, repo, pullNumber) {
  const files = [];
  let page = 1;
  while (true) {
    const { data } = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: pullNumber,
      per_page: PER_PAGE,
      page,
    });
    files.push(...data);
    if (data.length < PER_PAGE) break;
    page++;
  }
  return files;
}

function splitIntoChunks(files) {
  const filesWithPatches = files.filter(f => f.patch);

  if (filesWithPatches.length === 0) {
    return [];
  }

  const chunks = [];
  let currentChunk = [];
  let currentSize = 0;

  for (const file of filesWithPatches) {
    const fileSize = file.patch.length;

    if (currentSize + fileSize > MAX_CHUNK_SIZE && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentSize = 0;
    }

    currentChunk.push(file);
    currentSize += fileSize;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

function buildChunkPrompt(files, chunkIndex, totalChunks) {
  const diffs = files
    .filter(f => f.patch)
    .map(f => `### ${f.filename} (${f.status})\n\`\`\`diff\n${f.patch}\n\`\`\``)
    .join('\n\n');

  let prompt = 'Please review the following pull request changes and provide concise, constructive feedback. Focus on bugs, logic errors, security issues, and meaningful improvements. Skip trivial style comments.\n\n';

  if (totalChunks > 1) {
    prompt += `[This is part ${chunkIndex + 1} of ${totalChunks} in a large code review. Focus on the changes in this section only.]\n\n`;
  }

  prompt += diffs;

  return prompt;
}

function callZaiApi(apiKey, model, systemPrompt, prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const url = new URL(ZAI_API_URL);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => {
        data += chunk;
        if (data.length > MAX_RESPONSE_SIZE) {
          req.destroy(new Error(`${ERR_PREFIX}Response exceeded size limit.`));
        }
      });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch {
            reject(new Error(`${ERR_PREFIX}Invalid JSON response.`));
            return;
          }
          const content = parsed.choices?.[0]?.message?.content;
          if (!content) {
            reject(new Error(`${ERR_PREFIX}Empty response body.`));
          } else {
            resolve(content);
          }
        } else {
          reject(new Error(`${ERR_PREFIX}HTTP ${res.statusCode}.`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error(`${ERR_PREFIX}Request timed out.`));
    });
    req.write(body);
    req.end();
  });
}

async function callZaiApiWithRetry(apiKey, model, systemPrompt, prompt) {
  let lastError;

  for (let attempt = 0; attempt < RETRY_CONFIG.maxRetries; attempt++) {
    try {
      return await callZaiApi(apiKey, model, systemPrompt, prompt);
    } catch (err) {
      lastError = err;
      core.info(`API call failed (attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries}): ${err.message}`);

      if (attempt < RETRY_CONFIG.maxRetries - 1) {
        const delayMs = Math.min(
          RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt),
          RETRY_CONFIG.maxDelayMs
        );
        core.info(`Retrying in ${delayMs}ms...`);
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }

  throw lastError;
}

async function run() {
  const apiKey = core.getInput('ZAI_API_KEY', { required: true });
  core.setSecret(apiKey);
  const model = core.getInput('ZAI_MODEL') || 'glm-4.7';
  const systemPrompt = core.getInput('ZAI_SYSTEM_PROMPT');
  const reviewerName = core.getInput('ZAI_REVIEWER_NAME');
  const token = core.getInput('GITHUB_TOKEN');
  core.setSecret(token);

  const { context } = github;
  const { owner, repo } = context.repo;
  const pullNumber = context.payload.pull_request?.number;

  if (!pullNumber) {
    core.setFailed('This action only runs on pull_request events.');
    return;
  }

  const octokit = github.getOctokit(token);

  core.info(`Fetching changed files for PR #${pullNumber}...`);
  const files = await getChangedFiles(octokit, owner, repo, pullNumber);

  if (!files.some(f => f.patch)) {
    core.info('No patchable changes found. Skipping review.');
    return;
  }

  const chunks = splitIntoChunks(files);
  core.info(`Processing ${files.length} file(s) in ${chunks.length} chunk(s)...`);

  const reviews = [];
  const failedChunks = [];

  for (let i = 0; i < chunks.length; i++) {
    try {
      core.info(`Processing chunk ${i + 1}/${chunks.length} (${chunks[i].length} file(s))...`);
      const prompt = buildChunkPrompt(chunks[i], i, chunks.length);
      const review = await callZaiApiWithRetry(apiKey, model, systemPrompt, prompt);
      reviews.push({ index: i, review, success: true });
    } catch (err) {
      core.warning(`Chunk ${i + 1}/${chunks.length} failed: ${err.message}`);
      failedChunks.push({ index: i, error: err.message });
      reviews.push({ index: i, review: `**Error reviewing this chunk:** ${err.message}`, success: false });
    }
  }

  if (failedChunks.length > 0) {
    core.warning(`${failedChunks.length} chunk(s) failed out of ${chunks.length}`);
  }

  let combinedReview;
  if (chunks.length > 1) {
    combinedReview = reviews
      .map(r => `### Chunk ${r.index + 1}/${chunks.length}\n\n${r.review}`)
      .join('\n\n---\n\n');
    core.info(`Combined ${chunks.length} review chunk(s) into single comment.`);
  } else {
    combinedReview = reviews[0].review;
  }

  const body = `## ${reviewerName}\n\n${combinedReview}\n\n${COMMENT_MARKER}`;

  const { data: comments } = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: pullNumber,
  });
  const existing = comments.find(c => c.body.includes(COMMENT_MARKER));

  if (existing) {
    await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existing.id,
      body,
    });
    core.info('Review comment updated.');
  } else {
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: pullNumber,
      body,
    });
    core.info('Review comment posted.');
  }
}

run().catch(err => core.setFailed(err.message));

module.exports = {
  splitIntoChunks,
  buildChunkPrompt,
  callZaiApi,
  callZaiApiWithRetry,
  RETRY_CONFIG,
};
