let ratios = [];
let saveTimeout = null;
let lastPaint = 0;

// Inject CSS for smooth transitions (with !important)
const style = document.createElement('style');
style.textContent = `
  article {
    transition: border-color 0.9s ease !important;
  }
`;
console.log("Attempting to inject style...");
try {
  document.head.appendChild(style);
  console.log("Style injected successfully");
} catch (e) {
  console.log("Style injection failed:", e);
}

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

function parseAge(ageText, datetime) {
  const now = new Date();
  if (!ageText && datetime) {
    const postDate = new Date(datetime);
    const diffMs = now - postDate;
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    return diffMinutes > 525600 ? 525600 : diffMinutes; // Cap at ~1 year (525,600 minutes)
  }

  const match = ageText.match(/(\d+)([mhdwy])/i);
  if (!match) return 525600; // Default to 1 year for unparseable or old

  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  let minutes = 0;

  switch (unit) {
    case 'm': minutes = value; break; // minutes
    case 'h': minutes = value * 60; break; // hours
    case 'd': minutes = value * 1440; break; // days
    case 'w': minutes = value * 10080; break; // weeks
    case 'y': minutes = value * 525600; break; // years
    default: minutes = 525600;
  }
  return minutes > 525600 ? 525600 : minutes; // Cap at 1 year
}

function isAd(post) {
  return post.textContent.toLowerCase().includes('ad') || post.querySelector('[data-testid="ad"]');
}

/*
const gradientColors = [
  'rgb(4, 56, 69)', 
  'rgb(5, 78, 96)', 
  'rgb(6, 111, 138)', 
  'rgb(8, 132, 163)', 
  'rgb(11, 155, 192)', 
  'rgb(13, 178, 220)', 
  'rgb(14, 207, 255)'];
*/
const gradientColors = [
  'rgb(2, 28, 34)', 
  'rgb(6, 83, 102)', 
  'rgb(14, 207, 255)'];


function getGradientColor(ratio) {
  const lowThreshold = 2.0; // Adjusted from 1.5
  const highThreshold = 3.5; // Adjusted from 2.5
  color = ratio < lowThreshold ? gradientColors[0] : ratio > highThreshold ? gradientColors[2] : gradientColors[1];
  return color;
}

function paintTimeline() {
  const now = Date.now();
  if (now - lastPaint < 500) return;
  lastPaint = now;

  const cutoff = Date.now() - 86400000;
  ratios = ratios.filter(r => r.time > cutoff);

  const path = window.location.pathname;
  const isMainTimeline = path === '/' || path === '/home';

  if (isMainTimeline) {
    const sorted = ratios.map(r => r.value).sort((a, b) => a - b);

    document.querySelectorAll('article').forEach(post => {
      post.style.transition = 'border-color 0.9s ease';
      const commentElement = post.querySelector('[data-testid="reply"]') || post.querySelector('span.r-1qa8mrt');
      let comments = commentElement ? parseComments(commentElement.textContent) : null;
      const likes = getMetric(post, '[data-testid="like"]', 0);
      const retweets = getMetric(post, '[data-testid="retweet"]', 0);
      const views = getViews(post);
      const visibility = views !== null ? views : Math.max(likes + retweets, 1000);

      // Parse post age and detect ads
      const timeElement = post.querySelector('time');
      const ageText = timeElement?.textContent.trim() || '';
      const datetime = timeElement?.getAttribute('datetime');
      const ageInMinutes = parseAge(ageText, datetime);
      const isAdvertisement = isAd(post);
      let adjustedInfluence;

      if (isAdvertisement || ageInMinutes >= 525600) {
        // Use likes/retweets as proxy for ads or very old posts
        adjustedInfluence = (likes * 10 + retweets * 5);
      } else if (ageInMinutes > 0) {
        // Views/age for recent posts
        adjustedInfluence = views / ageInMinutes;
      } else {
        adjustedInfluence = views; // Fallback for zero age
      }

      let ratio, color;
      if (!commentElement || (comments === null || comments === 0)) {
        const adjustedVisibility = visibility + (adjustedInfluence * 10); // Tweak multiplier
        ratio = Math.log10(adjustedVisibility) / Math.log10(1 + 1);
        color = getGradientColor(5);
        console.log(`Post: Age=${ageText || datetime}, Views=${views}, Adjusted Influence=${adjustedInfluence.toFixed(2)}, Comments=0, Likes=${likes}, Retweets=${retweets}, IsAd=${isAdvertisement}, Adjusted Ratio=${ratio.toFixed(2)}`);
      } else {
        comments = comments && !isNaN(comments) ? comments : 1;
        const adjustedVisibility = visibility + (adjustedInfluence * 10);
        ratio = Math.log10(adjustedVisibility) / Math.log10(comments + 1);
        color = getGradientColor(ratio);
        console.log(`Post: Age=${ageText || datetime}, Views=${views}, Adjusted Influence=${adjustedInfluence.toFixed(2)}, Comments=${comments}, Likes=${likes}, Retweets=${retweets}, IsAd=${isAdvertisement}, Ratio=${ratio.toFixed(2)}`);
      }

      post.style.border = `2px solid ${color}`; // Adjusted from 3px

      try {
        ratios.push({ value: visibility / comments || Infinity, time: now });
        if (ratios.length > 100) {
          ratios.sort((a, b) => b.time - a.time);
          ratios = ratios.slice(0, 100);
        }
        saveRatios();
      } catch (e) {
        console.log("Push or save failed:", e);
      }
    });
  } else {
    document.querySelectorAll('article').forEach(post => {
      post.style.border = '';
    });
    console.log(`Not on main timeline (path: ${path}), borders cleared.`);
  }
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