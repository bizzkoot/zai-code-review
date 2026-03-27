const core = require('@actions/core');
const github = require('@actions/github');
const https = require('https');

const ConversationalFeedback = require('./review/ConversationalFeedback');
const InlineSuggestion = require('./review/InlineSuggestion');
const FeedbackLearning = require('./review/FeedbackLearning');
const SecurityCheck = require('./review/SecurityCheck');

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

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

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

  if (filesWithPatches.length === 0) return [];

  const chunks = [];
  let currentChunk = [];
  let currentSize = 0;

  for (const file of filesWithPatches) {
    const fileSize = file.patch.length;

    // Mark files that exceed chunk size individually
    if (fileSize > MAX_CHUNK_SIZE) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = [];
        currentSize = 0;
      }
      chunks.push([{ ...file, oversized: true }]);
      continue;
    }

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

function extractActionableSuggestions(reviews) {
  const suggestions = [];
  const seen = new Set();
  const contentHashes = new Set();

  for (const review of reviews) {
    const content = review.rawReview || '';
    const matches = Array.from(content.matchAll(/\[\[suggestion:(.+?)\]\]/gs));

    for (const match of matches) {
      const parts = match[1].split(':');
      if (parts.length < 6 || parts[0] !== 'path' || parts[2] !== 'line') {
        continue;
      }

      const line = Number(parts[3]);
      const body = parts[4]?.trim();
      const suggestion = parts.slice(5).join(':').trim();
      const path = parts[1]?.trim();

      if (!path || !Number.isInteger(line) || line < 1 || !body || !suggestion) {
        continue;
      }

      // Deduplicate by file:line:body combination
      const id = `${path}:${line}:${body}`;
      const contentHash = hashString(`${body}:${suggestion}`.toLowerCase());
      
      if (seen.has(id)) {
        continue; // Skip duplicate file:line:body
      }
      
      // Skip if same content was already seen (regardless of line)
      if (contentHashes.has(contentHash)) {
        continue;
      }

      seen.add(id);
      contentHashes.add(contentHash);
      suggestions.push({
        id,
        path,
        line,
        side: 'RIGHT',
        body,
        suggestion,
      });
    }
  }

  return suggestions;
}

function formatSecurityFindingsForReview(findings) {
  if (!Array.isArray(findings) || findings.length === 0) {
    return '';
  }

  return findings.map(finding => {
    const severity = mapSecuritySeverityToReviewSeverity(finding.severity);
    const location = `${finding.path}:${finding.line}`;
    return [
      `## [${severity}] ${location} - ${finding.message}`,
      `**Problem:** ${finding.message}`,
      '**Impact:** Security-sensitive code was added in this diff and should be reviewed carefully.',
    ].join('\n');
  }).join('\n\n');
}

function mapSecuritySeverityToReviewSeverity(severity) {
  switch ((severity || '').toLowerCase()) {
  case 'high':
    return 'CRITICAL';
  case 'medium':
    return 'MAJOR';
  case 'low':
    return 'MINOR';
  default:
    return 'INFO';
  }
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
          } catch (err) {
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

async function filterResolvedSuggestions(octokit, owner, repo, pullNumber, suggestions) {
  try {
    const comments = [];
    let page = 1;
    while (true) {
      const { data } = await octokit.rest.pulls.listReviewComments({
        owner,
        repo,
        pull_number: pullNumber,
        per_page: PER_PAGE,
        page,
      });
      comments.push(...data);
      if (data.length < PER_PAGE) break;
      page++;
    }

    // Get resolved comment IDs by file:line key
    const resolvedIds = new Set();
    for (const comment of comments) {
      // Check if comment has resolved state
      if (comment.state === 'RESOLVED' || comment.resolved) {
        const key = `${comment.path}:${comment.line || comment.original_line}`;
        resolvedIds.add(key);
      }
    }

    // Also check via reviews API for outdated reviews
    try {
      await octokit.rest.pulls.listReviews({
        owner,
        repo,
        pull_number: pullNumber,
      });
      // Note: APPROVED and CHANGES_REQUESTED reviews don't necessarily mean resolved,
      // but we can add additional filtering logic here if needed.
      // For now, we only filter by explicit RESOLVED state.
    } catch (err) {
      core.warning(`Could not fetch review state: ${err.message}`);
    }

    // Filter suggestions to exclude resolved ones
    return suggestions.filter(s => {
      const key = `${s.path}:${s.line}`;
      return !resolvedIds.has(key);
    });
  } catch (err) {
    core.warning(`Could not filter resolved suggestions: ${err.message}`);
    // Return all suggestions if filtering fails (fail-open)
    return suggestions;
  }
}

function calculateSimilarity(str1, str2) {
  const words1 = new Set(str1.split(/\s+/).filter(w => w.length > 0));
  const words2 = new Set(str2.split(/\s+/).filter(w => w.length > 0));
  const intersection = [...words1].filter(w => words2.has(w));
  const union = new Set([...words1, ...words2]);
  return union.size === 0 ? 0 : intersection.length / union.size;
}

async function getExistingCommentThreads(octokit, owner, repo, pullNumber) {
  try {
    const { data: comments } = await octokit.rest.pulls.listReviewComments({
      owner,
      repo,
      pull_number: pullNumber,
      per_page: 100,
    });

    const threads = new Map();
    for (const comment of comments) {
      const key = `${comment.path}:${comment.line || comment.original_line || 'noline'}`;
      if (!threads.has(key)) {
        threads.set(key, []);
      }
      threads.get(key).push(comment);
    }
    return threads;
  } catch (err) {
    core.warning(`Failed to fetch existing threads: ${err.message}`);
    return new Map();
  }
}

function findSimilarThread(threads, suggestion, threshold = 0.6) {
  const key = `${suggestion.path}:${suggestion.line}`;
  const existing = threads.get(key);

  if (!existing || existing.length === 0) {
    return null;
  }

  for (const comment of existing) {
    const similarity = calculateSimilarity(
      suggestion.body.toLowerCase(),
      comment.body.toLowerCase()
    );
    if (similarity > threshold) {
      return comment;
    }
  }
  return null;
}

async function run() {
  const apiKey = core.getInput('ZAI_API_KEY', { required: true });
  core.setSecret(apiKey);
  const model = core.getInput('ZAI_MODEL') || 'glm-4.7';
  const systemPrompt = core.getInput('ZAI_SYSTEM_PROMPT');
  const reviewerName = core.getInput('ZAI_REVIEWER_NAME');
  const token = core.getInput('GITHUB_TOKEN');
  core.setSecret(token);
  let threadSimilarityThreshold = parseFloat(core.getInput('ZAI_THREAD_SIMILARITY_THRESHOLD'));
  if (isNaN(threadSimilarityThreshold) || threadSimilarityThreshold < 0 || threadSimilarityThreshold > 1) {
    threadSimilarityThreshold = 0.6;
  }
  const commitFeedback = core.getInput('ZAI_COMMIT_FEEDBACK').toLowerCase() === 'true';

  const { context } = github;
  const { owner, repo } = context.repo;
  const pullNumber = context.payload.pull_request?.number;

  if (!pullNumber) {
    core.setFailed('This action only runs on pull_request events.');
    return;
  }

  const headSha = context.payload.pull_request?.head?.sha;
  if (!headSha) {
    core.warning('Missing pull request head SHA. Inline suggestions may not work correctly.');
  }

  const octokit = github.getOctokit(token);

  // FeedbackLearning repoId: owner/repo
  const repoId = `${owner}/${repo}`;

  core.info(`Fetching changed files for PR #${pullNumber}...`);

  const files = await getChangedFiles(octokit, owner, repo, pullNumber);

  if (!files.some(f => f.patch)) {
    core.info('No patchable changes found. Skipping review.');
    return;
  }

  // --- SecurityCheck integration ---
  // Load custom patterns from .zai-review.yaml
  const workspaceRoot = process.env.GITHUB_WORKSPACE || process.cwd();
  const customPatterns = SecurityCheck.loadCustomPatterns(workspaceRoot);
  if (customPatterns.length > 0) {
    core.info(`Loaded ${customPatterns.length} custom security pattern(s) from .zai-review.yaml`);
  }

  const securityFindings = SecurityCheck.checkSecurity(files, customPatterns);
  if (securityFindings.length > 0) {
    core.warning(`Security findings detected: ${securityFindings.length}`);
    for (const finding of securityFindings) {
      core.warning(`[${finding.severity}] ${finding.path}:${finding.line} - ${finding.message}`);
    }
  }

  const chunks = splitIntoChunks(files);
  core.info(`Processing ${files.length} file(s) in ${chunks.length} chunk(s)...`);

  const reviews = [];
  const failedChunks = [];

  for (let i = 0; i < chunks.length; i++) {
    try {
      const oversizedFiles = chunks[i].filter(f => f.oversized);
      if (oversizedFiles.length > 0) {
        for (const f of oversizedFiles) {
          core.warning(`File ${f.filename} exceeds chunk size limit (${f.patch.length} bytes). Review may be incomplete.`);
        }
      }
      core.info(`Processing chunk ${i + 1}/${chunks.length} (${chunks[i].length} file(s))...`);
      const prompt = ConversationalFeedback.buildPrompt(chunks[i], i, chunks.length);
      const rawReview = await callZaiApiWithRetry(apiKey, model, systemPrompt, prompt);
      const review = ConversationalFeedback.postProcess(rawReview);
      // Prepend actionable security findings for this chunk
      const chunkFindings = SecurityCheck.checkSecurity(chunks[i]);
      const securityReview = formatSecurityFindingsForReview(chunkFindings);
      const summaryReview = securityReview ? `${securityReview}\n\n${rawReview}` : rawReview;
      let reviewWithSecurity = review;
      if (chunkFindings.length > 0) {
        const secHeader = '#### Security Findings (static analysis)\n';
        const secList = chunkFindings.map(f => `- [${f.severity}] ${f.path}:${f.line} - ${f.message}`).join('\n');
        reviewWithSecurity = `${secHeader}${secList}\n\n${review}`;
      }
      reviews.push({ index: i, rawReview, summaryReview, review: reviewWithSecurity, success: true });
    } catch (err) {
      core.warning(`Chunk ${i + 1}/${chunks.length} failed: ${err.message}`);
      failedChunks.push({ index: i, error: err.message });
      reviews.push({ index: i, rawReview: '', review: `**Error reviewing this chunk:** ${err.message}`, success: false });
    }
  }

  if (failedChunks.length > 0) {
    core.warning(`${failedChunks.length} chunk(s) failed out of ${chunks.length}`);
    if (failedChunks.length === chunks.length) {
      core.setFailed('All review chunks failed. No review could be generated.');
      return;
    }
  }

  // Extract outside-diff comments from each chunk and collect them
  let allOutsideDiffComments = [];
  let rawCombinedReview = '';

  if (chunks.length > 1) {
    for (const r of reviews) {
      if (r.success) {
        const separated = ConversationalFeedback.separateOutsideDiffComments(r.rawReview);
        allOutsideDiffComments.push(...separated.outsideDiffComments);
        rawCombinedReview += r.summaryReview + '\n\n';
      }
    }
    core.info(`Combined ${chunks.length} review chunk(s) into single comment.`);
  } else {
    if (reviews[0]?.success) {
      const separated = ConversationalFeedback.separateOutsideDiffComments(reviews[0].rawReview);
      allOutsideDiffComments.push(...separated.outsideDiffComments);
      rawCombinedReview = reviews[0].summaryReview;
    } else {
      rawCombinedReview = reviews[0]?.review || '';
    }
  }

  // Extract actionable suggestions count for formatting
  let actionableSuggestions = extractActionableSuggestions(reviews);

  // Adapt and filter suggestions before posting
  actionableSuggestions = FeedbackLearning.adapt(repoId, actionableSuggestions);

  // Filter out already-resolved suggestions
  if (actionableSuggestions.length > 0) {
    actionableSuggestions = await filterResolvedSuggestions(
      octokit, owner, repo, pullNumber, actionableSuggestions
    );
  }

  // Check if there are critical outside-diff comments
  const hasCriticalOutsideDiff = allOutsideDiffComments.some(c => {
    const content = c.content?.join('\n') || '';
    return /\b(critical|blocker)\b/i.test(content);
  });

  // Format the review with collapsible sections and severity grouping
  const combinedReview = ConversationalFeedback.formatReview(rawCombinedReview, {
    actionableCount: actionableSuggestions.length,
    hasCriticalOutsideDiff,
    outsideDiffComments: allOutsideDiffComments,
  });

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

  // Inline suggestion integration
  if (actionableSuggestions.length > 0) {
    try {
      // Fetch existing comment threads for threading support
      let existingThreads = null;
      try {
        existingThreads = await getExistingCommentThreads(octokit, owner, repo, pullNumber);
      } catch (err) {
        core.warning(`Could not fetch existing threads: ${err.message}`);
        existingThreads = new Map();
      }

      const postedSuggestions = await InlineSuggestion.postSuggestions(octokit, {
        owner,
        repo,
        pullNumber,
        suggestions: actionableSuggestions,
        existingThreads,
        headSha: context.payload.pull_request?.head?.sha,
        threadSimilarityThreshold,
      });

      if (postedSuggestions > 0) {
        core.info(`Posted ${postedSuggestions} inline suggestion(s).`);
      }
    } catch (err) {
      core.warning(`Inline suggestions skipped: ${err.message}`);
    }
  }

  // Listen for user feedback (accept/reject) via review events (pseudo-code, to be implemented in webhook or future extension)
  // Example usage:
  // FeedbackLearning.learnFromFeedback(repoId, suggestionId, accepted);

  // Persist .zai-feedback.json to PR branch if enabled
  if (commitFeedback) {
    const feedbackFile = '.zai-feedback.json';
    const fs = require('fs');
    if (fs.existsSync(feedbackFile)) {
      const execSync = require('child_process').execSync;
      try {
        execSync('git config --local user.email "github-actions[bot]@users.noreply.github.com"');
        execSync('git config --local user.name "github-actions[bot]"');
        execSync(`git add ${feedbackFile}`);
        execSync(`git commit -m "chore: update feedback learning for PR #${pullNumber}" || true`);
        execSync('git push');
        core.info('.zai-feedback.json committed and pushed to PR branch.');
      } catch (err) {
        core.warning(`Failed to commit/push .zai-feedback.json: ${err.message}`);
      }
    }
  }
}

if (require.main === module) {
  run().catch(err => core.setFailed(err.message));
}

module.exports = {
  splitIntoChunks,
  buildChunkPrompt,
  extractActionableSuggestions,
  formatSecurityFindingsForReview,
  filterResolvedSuggestions,
  calculateSimilarity,
  getExistingCommentThreads,
  findSimilarThread,
  callZaiApi,
  callZaiApiWithRetry,
  hashString,
  RETRY_CONFIG,
};
