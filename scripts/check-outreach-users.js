const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..', process.env.PUBLIC_SITE_ROOT || '.');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
for (const file of ['data/outreach-users.json','data/first-outreach-users.json']) {
  assert.ok(!fs.existsSync(path.join(root,file)), 'Customer-level records must stay outside the public artifact');
}
const summary = JSON.parse(read('data/outreach-summary.json'));
const data = JSON.parse(read('data/customer-analytics.json'));
assert.equal(summary.total, summary.recent + summary.high - summary.overlap);
assert.equal(data.outreach.total, summary.total);
assert.equal(summary.recent, 1365);
assert.equal(summary.high, 3922);
assert.equal(summary.overlap, 55);
assert.match(read('first-outreach.html'), /href="customer-analytics.html#outreach"/);
assert.match(read('first-outreach-users.html'), /url=customer-analytics.html#outreach/);
assert.ok(!read('first-outreach-users.js').includes('fetch('));
const source = JSON.stringify(data) + JSON.stringify(summary);
assert.doesNotMatch(source, /customer_id|masked_email|@/);
console.log('Aggregate outreach counts and customer-record exclusion passed');
