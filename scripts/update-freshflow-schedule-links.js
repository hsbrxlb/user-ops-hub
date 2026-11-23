const fs = require('node:fs');
const path = require('node:path');

const escape = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;');

function publishedUrl(value) {
  if (!value) return '';
  const url = new URL(value);
  const hasCredentialKey = [...url.searchParams.keys()].some((key) =>
    /^(?:token|access_token|api_key|secret|password|auth|signature|sig)$/i.test(key));
  if (url.protocol !== 'https:' || url.username || url.password || hasCredentialKey) {
    throw new Error('Schedule Link must be a public HTTPS URL');
  }
  return escape(value);
}

const file = path.join(__dirname, '..', 'feed-cozeware.html');
const original = fs.readFileSync(file, 'utf8');
const rows = JSON.parse(fs.readFileSync(0, 'utf8'));
const schedule = new Map();
for (const { id, day, url } of rows) {
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(day) || schedule.has(id)) {
    throw new Error('Schedule rows need a unique Post ID and an ISO date');
  }
  schedule.set(id, { day, url });
}

let links = 0;
const days = /(<section class="feed-day" data-date="([^"]+)"[^>]*>)([\s\S]*?)(<\/section>)/g;
// Only FreshFlow posts (data-purpose contains "freshflow") are synced from the Schedule sheet.
const posts = /(<article class="post" data-post="([^"]+)" data-purpose="([^"]*)"[^>]*>[\s\S]*?)(<\/div>\n<\/article>)/g;
const updated = original.replace(days, (_, open, day, body, close) => open + body.replace(posts, ($match, post, id, purpose, end) => {
  if (!purpose.split(/\s+/).includes('freshflow')) return $match;
  const row = schedule.get(id);
  if (!row || row.day !== day) throw new Error(`No matching Schedule row for ${id} on ${day}`);
  const clean = post.replace(/\n?<p class="feed-schedule-link">[\s\S]*?<\/p>/, '').trimEnd() + '\n';
  const url = publishedUrl(row.url);
  if (!url) return clean + end;
  links += 1;
  return clean + `<p class="feed-schedule-link"><span class="feed-schedule-link-label">链接</span><a href="${url}" target="_blank" rel="noopener noreferrer">${url}<span aria-hidden="true"> ↗</span></a></p>\n` + end;
}) + close);

if (updated !== original) fs.writeFileSync(file, updated);
console.log(`FreshFlow: ${links} Schedule Link entries`);
