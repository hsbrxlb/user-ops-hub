const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const nav = JSON.parse(read('data/content.json')).nav;

const home = read('index.html');
assert.ok(home.includes('data-page="home"'));
assert.ok(!/http-equiv=["']refresh|location\.(?:replace|assign)|location\s*=/.test(home), 'home must not redirect to a topic');
assert.ok(home.includes('<h1>海外用户运营 <span>Hub</span></h1>'));
assert.ok(home.includes('id="breadcrumb-page">首页</strong>'));
assert.ok(read('app.js').includes("const staticContentPage = ['home',"), 'homepage remains readable if data loading fails');
assert.ok(read('app.js').includes("page === 'home' ? '首页'"));
const homeMain = home.match(/<main[^>]*>([\s\S]*?)<\/main>/)[1];
for (const item of nav.filter(item => item.id !== 'home' && !item.reserved)) {
  assert.ok(homeMain.includes('href="' + item.file + '"'), 'homepage links to ' + item.id);
}
assert.equal((homeMain.match(/class="section home-directory"/g) || []).length, 7);
assert.ok(read('context.html').includes("location.replace('index.html')"));
assert.ok(home.includes('base.css') && home.includes('theme.css'), 'keep existing visual system');
assert.ok(home.includes('class="menu-button"') && home.includes('class="skip-link"'));


for (const [id, label] of Object.entries({"mascot": "OEDRO 吉祥物", "merch-plan": "OEDRO 周边", "ugc-activity": "车主故事征集", "campaigns-oedro": "OEDRO 年末抽奖", "campaigns-cozeware": "Cozeware 年末抽奖", "user-segments-oedro": "OEDRO 用户分层"})) assert.equal(nav.find(item => item.id === id)?.label, label);
assert.deepEqual(nav.map(item => item.id), ["home", "content-guides", "content-review", "studio", "comics-gallery", "skills", "social-brand", "brand-voice-system", "mascot", "merch-plan", "products", "freshflow", "discord-community", "discord-invite-plan", "newsletter", "email-templates", "loyalty", "repurchase", "ugc-activity", "campaigns-oedro", "campaigns-cozeware", "customer-analytics", "first-outreach", "voice", "competitor-experience", "research", "user-segments-oedro"]);
assert.deepEqual([...new Set(nav.map(item => item.group).filter(Boolean))], ["社媒内容", "品牌与产品", "社区与邮件", "会员与复购", "活动", "用户与市场研究"]);
const staticPages = read('app.js').match(/const staticContentPage = \[([^\]]+)\]/)[1];
for (const id of ['first-outreach', 'discord-invite-plan', 'ugc-activity', 'comics-gallery', 'skills']) {
  const html = read(`${id}.html`);
  assert.ok(html.includes(`data-page="${id}"`));
  assert.ok(staticPages.includes(`'${id}'`), 'static pages retain their content during navigation loading');
}
for (const id of ['comics-gallery', 'skills']) {
  assert.equal(nav.find(item => item.id === id)?.group, '社媒内容');
  assert.match(read(`${id}.html`), new RegExp(`<a aria-current="page" class="active" data-page="${id}"`));
}
assert.ok(nav.some(item => item.id === 'products' && item.file === 'products.html'));
assert.ok(!nav.some(item => ['research-library', 'sites-systems', 'playbook'].includes(item.id)));

const discord = JSON.parse(read('data/topics/discord-community.json'));
const discordContent = {};
const discordRenderer = read('app.js').match(/function renderDiscord\(topic, data\) \{[\s\S]*?\n\}/)[0];
const discordContext = {
  document: { querySelector: selector => selector === '#content' ? discordContent : {} },
  escapeHtml: value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
  pageHeading: title => `<h1>${title}</h1>`
};
vm.createContext(discordContext);
vm.runInContext(discordRenderer, discordContext);
discordContext.renderDiscord(discord, { site: { title: 'Hub' } });
assert.ok(!discordContent.innerHTML.includes('discord-configuration'), 'omit empty settings and unsupported bot claims');
assert.ok(!/已安装|未开启/.test(discordContent.innerHTML));
for (const server of discord.servers) {
  assert.ok(discordContent.innerHTML.includes(`id="${server.id}"`));
  for (const group of server.groups) for (const channel of group.channels) assert.ok(discordContent.innerHTML.includes(channel));
}
const configuredDiscord = structuredClone(discord);
configuredDiscord.servers[0].bots = [{ name: 'Example bot', purpose: 'Handle <help> requests' }];
configuredDiscord.servers[0].settings = [['Example setting', 'Enabled']];
discordContext.renderDiscord(configuredDiscord, { site: { title: 'Hub' } });
assert.equal((discordContent.innerHTML.match(/class="discord-configuration"/g) || []).length, 1);
assert.ok(discordContent.innerHTML.indexOf('discord-configuration') > discordContent.innerHTML.indexOf('garage-talk'));
assert.ok(discordContent.innerHTML.includes('Handle &lt;help&gt; requests'));
assert.ok(discordContent.innerHTML.includes('<dt>Example setting</dt><dd>Enabled</dd>'));

const persona = JSON.parse(read('data/topics/brand-voice-system.json'));
const topicVisibility = read('app.js').match(/function visibleTopicSections\(topic\) \{[\s\S]*?\n\}/)[0];
const topicContext = {};
vm.createContext(topicContext);
vm.runInContext(topicVisibility, topicContext);
const visiblePersona = topicContext.visibleTopicSections(persona);
for (const id of ['brand-name', 'everyday-example', 'discord-example', 'fitment-example', 'support-example', 'research-example', 'ugc-example']) {
  assert.ok(visiblePersona.some(section => section.id === id && section.paragraphs.length >= 2), `${id} reaches the page renderer`);
}
assert.ok(!visiblePersona.some(section => section.id === 'validation'), 'internal review state stays out of the reading page');

for (const file of ['sema-plan.html', 'sema-promotion.html', 'data/sema-promotion.json', 'content-pipeline-test.html', 'data/topics/seo-geo.json']) {
  assert.ok(!fs.existsSync(path.join(root, file)), 'withdrawn public content remains absent: ' + file);
}
assert.ok(!nav.some(item => /^sema-/.test(item.id)));
assert.ok(!/href="sema-/.test(home));

// Resource entries disclose their actual type and size and preserve source files.
assert.ok(!homeMain.includes('hub-hero-media') && !/Bruno|mascot-kit\//.test(homeMain), 'homepage has no mascot showcase');
const guides = read('content-guides.html');
for (const id of ['1NJArYiaoi8NqiUCKW9d93Y-EieA6TkFL', '1xVehYVMVfieKDRxjTGtK0zl0lDdjPfd_', '1hQ1_4GUxj7oGoGnAHdSN2Iyl38itZtXe', '1ouN9F_a-USEeE85369Z9GjcGFhZt41-y', '1CreDhIbUz5AUU-Z_fLeJc7ILuzkNv9kj']) {
  assert.ok(guides.includes('https://drive.google.com/drive/folders/' + id), 'brand folder is linked: ' + id);
}
assert.ok(!/href="[^\"]+brand-pack\.zip/.test(guides), 'brand folders replace ZIP entries');
assert.ok(!/1FKH_RYGcdbNnaBjQ6NzoTXvOJRALywErPd80OZffalg|1xHtbq-JyEWHkiLCIXipD039I_csuJ3pacxrDOrRK9sY/.test(guides), 'guide entries stay within reviewed material folders');
const skills = read('skills.html');
assert.ok(!skills.includes('mono-color'), 'retired skill is absent from the page');
assert.doesNotMatch(skills, /href="[^"]+\.zip/);
const skillIndex = JSON.parse(read('skills/index.json'));
const skillCards = [...skills.matchAll(/data-skill="([a-z0-9-]+)"/g)].map(match => match[1]);
assert.equal(skillCards.length, 10);
assert.deepEqual(new Set(skillCards), new Set([
  'story-first-comics', 'brand-creative-direction', 'mascot-design', 'brand-copy-studio',
  'multiplatform-content-pack', 'anti-ai-slop-review', 'visual-review',
  'conversational-survey-builder', 'community-replies', 'user-voice-pipeline'
]));
assert.equal((skills.match(/id="sg-download"[^>]*>下载 MD</g) || []).length, 1);
assert.equal((skills.match(/id="sg-copy"[^>]*>复制全文</g) || []).length, 1);
assert.ok(!nav.some(item => item.reserved || item.group === '样例'));
assert.ok(staticPages.includes("'studio'"), 'the work instructions render without a workflow loader');
assert.match(read('content-studio.html'), /<h1>内容生产流程<\/h1>/);
assert.match(JSON.parse(read('data/mascot-workflow.json')).html, /skills\.html#\/mascot-design/);
assert.deepEqual(skillCards.sort(), skillIndex.skills.map(skill => skill.name).sort());
for (const id of ['social-brand', 'merch-plan', 'discord-invite-plan', 'first-outreach', 'ugc-activity', 'customer-analytics']) {
  const source = read(id + '.html');
  assert.ok(source.includes('id="oedro-brand-title"'), id + ': includes existing brand content');
  assert.doesNotMatch(source, /brand-empty|暂无，制作后放在这里/);
}
