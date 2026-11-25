const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..', process.env.PUBLIC_SITE_ROOT || '.');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
for (const file of ['data/outreach-users.json','data/first-outreach-users.json']) {
  assert.ok(!fs.existsSync(path.join(root,file)), 'Customer-level records must stay outside the public artifact');
}
const source = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const summary = JSON.parse(source('data/outreach-summary.json'));
const data = JSON.parse(source('data/customer-analytics.json'));
for (const file of ['data/customer-analytics.json', 'data/outreach-summary.json']) {
  if (process.env.PUBLIC_SITE_ROOT) assert.ok(!fs.existsSync(path.join(root, file)), 'Business counts stay out of the public artifact: ' + file);
}
assert.equal(summary.total, summary.recent + summary.high - summary.overlap);
assert.equal(data.outreach.total, summary.total);
assert.equal(summary.recent, 1365);
assert.equal(summary.high, 3922);
assert.equal(summary.overlap, 55);
assert.match(read('first-outreach.html'), /href="customer-analytics.html#outreach"/);
assert.match(read('first-outreach-users.html'), /url=customer-analytics.html#outreach/);
assert.ok(!read('first-outreach-users.js').includes('fetch('));
const serialized = JSON.stringify(data) + JSON.stringify(summary);
assert.doesNotMatch(serialized, /customer_id|masked_email|@/);
console.log('Aggregate outreach counts and customer-record exclusion passed');
