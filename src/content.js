let ratios = [];
let saveTimeout = null;
let lastPaint = 0;

chrome.storage.local.get(['learnedRatios'], (result) => {
  ratios = result.learnedRatios || [];
  const cutoff = Date.now() - 86400000;
  ratios = ratios.filter(r => r.time > cutoff);
  if (!ratios.length) initializeBaseline();
  paintTimeline();
});

function initializeBaseline() {
  document.querySelectorAll('article').forEach(post => {
    const comments = getMetric(post, '[data-testid="reply"]', 1);
    const likes = getMetric(post, '[data-testid="like"]', 0);
    const retweets = getMetric(post, '[data-testid="retweet"]', 0);
    const views = getViews(post);
    const visibility = views !== null ? views : Math.max(likes + retweets, 1000);
    ratios.push({ value: visibility / comments, time: Date.now() });
  });
  saveRatios();
}

function paintTimeline() {
  const now = Date.now();
  if (now - lastPaint < 500) return;
  lastPaint = now;

  const cutoff = Date.now() - 86400000;
  ratios = ratios.filter(r => r.time > cutoff);
  
  const sorted = ratios.map(r => r.value).sort((a, b) => a - b);
  
  document.querySelectorAll('article').forEach(post => {
    const commentElement = post.querySelector('[data-testid="reply"]') || post.querySelector('span.r-1qa8mrt');
    let comments = commentElement ? parseComments(commentElement.textContent) : null;
    const likes = getMetric(post, '[data-testid="like"]', 0);
    const retweets = getMetric(post, '[data-testid="retweet"]', 0);
    const views = getViews(post);
    const visibility = views !== null ? views : Math.max(likes + retweets, 1000);

    let ratio, color;
    if (!commentElement || (comments === null || comments === 0)) {
      color = 'green';
      ratio = Infinity;
      console.log(`Post: Comments=0, Likes=${likes}, Retweets=${retweets}, Views=${views}, RawCommentText="${commentElement ? commentElement.textContent.trim() : 'N/A'}", Ratio=Infinity (Zero comments!)`);
    } else {
      comments = comments && !isNaN(comments) ? comments : 1;
      ratio = Math.log10(visibility) / Math.log10(comments + 1);
      const redThreshold = 1.5;
      const greenThreshold = 2.5;
      color = ratio < redThreshold ? 'red' : ratio > greenThreshold ? 'green' : 'yellow';
      console.log(`Post: Comments=${comments}, Likes=${likes}, Retweets=${retweets}, Views=${views}, RawCommentText="${commentElement.textContent.trim()}", Ratio=${ratio.toFixed(2)} (Log scale)`);
    }

    post.style.border = `3px solid ${color}`;

    try {
      ratios.push({ value: visibility / comments || Infinity, time: Date.now() });
      if (ratios.length > 100) {
        ratios.sort((a, b) => b.time - a.time);
        ratios = ratios.slice(0, 100);
      }
      saveRatios();
    } catch (e) {
      console.log("Push or save failed:", e);
    }
  });
}

function getMetric(post, selector, defaultValue) {
  const element = post.querySelector(selector) || post.querySelector('span.r-1qa8mrt');
  const value = element ? parseInt(element.textContent.replace(/[^0-9]/g, '')) : null;
  return isNaN(value) ? defaultValue : value;
}

function getViews(post) {
  const analyticsLink = post.querySelector('a[href*="/analytics"]');
  if (analyticsLink) {
    const viewSpan = analyticsLink.querySelector('span');
    if (viewSpan) {
      const viewNum = parseViews(viewSpan.textContent);
      if (viewNum !== null) return viewNum;
    }
  }
  const spans = post.querySelectorAll('span');
  for (let span of spans) {
    const text = span.textContent.toLowerCase();
    if (text.includes('views')) {
      const viewNum = parseViews(text);
      if (viewNum !== null) return viewNum;
    }
  }
  return null;
}

function parseComments(text) {
  const numMatch = text.match(/(\d*\.?\d+)([kKmM]?)/);
  if (!numMatch) return null;
  let num = parseFloat(numMatch[1]);
  if (isNaN(num)) return null;
  if (numMatch[2]) {
    if (numMatch[2].toLowerCase() === 'k') num *= 1000;
    if (numMatch[2].toLowerCase() === 'm') num *= 1000000;
  }
  return Math.round(num);
}

function parseViews(text) {
  const numMatch = text.match(/(\d*\.?\d+)([kKmM]?)/);
  if (!numMatch) return null;
  let num = parseFloat(numMatch[1]);
  if (isNaN(num)) return null;
  if (numMatch[2]) {
    if (numMatch[2].toLowerCase() === 'k') num *= 1000;
    if (numMatch[2].toLowerCase() === 'm') num *= 1000000;
  }
  return Math.round(num);
}

function saveRatios() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    if (!(chrome.runtime && chrome.runtime.id)) {
      console.log("Context invalidated, skipping save.");
      return;
    }
    chrome.storage.local.set({ learnedRatios: ratios }, () => {
      if (chrome.runtime.lastError) {
        console.log("Storage error:", chrome.runtime.lastError);
      }
    });
  }, 1000);
}

const observer = new MutationObserver(() => paintTimeline());
observer.observe(document.body, { childList: true, subtree: true });