"""Render the campaign entry page and change only the matching Hub round-one page."""

import argparse
from html import escape
from pathlib import Path
import re
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
BRANDS = {
    "oedro": {
        "name": "OEDRO",
        "prize": "LEGO Speed Champions Bugatti Centodieci (77240)",
        "value": "$26.99",
        "question": "What’s one small job your vehicle is always ready for?",
        "email": "service@oedro.com",
        "privacy": "https://www.oedro.com/article/privacy.html?aid=88",
        "sponsor": "Hong Kong Yinta International Trade Company Limited, Room 401, 4/F, Wanchai Central Building, 89 Lockhart Road, Wan Chai, Hong Kong",
        "third_parties": "LEGO, Bugatti and Target",
    },
    "cozeware": {
        "name": "Cozeware",
        "prize": "Handy Heater Pocket Warmers 2-Pack",
        "value": "$29.99",
        "question": "Which corner of your home feels coldest in winter?",
        "email": "service@cozeware.com",
        "privacy": "https://www.cozeware.com/article/Privacy-Policy.html?aid=136",
        "sponsor": "Cozeware.com",
        "third_parties": "Handy Heater and Target",
    },
}


def public_page(brand, state, form_url):
    facts = {key: escape(value) for key, value in BRANDS[brand].items()}
    button = (
        f'<p><a class="entry-action" href="{escape(form_url)}">Enter the giveaway</a></p>'
        if state == "open"
        else '<p><a class="entry-action" href="#official-rules">Read the Official Rules</a></p>'
    )
    entry_status = "Entries are open." if state == "open" else "Entries are closed."
    return f'''<!doctype html>
<html lang="en-US">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow, noarchive">
  <title>{facts["name"]} Year-End Giveaway · Round 1</title>
  <link rel="stylesheet" href="campaign-entry.css">
</head>
<body class="{brand}">
  <main class="entry">
    <header class="entry-header">
      <img class="entry-logo" src="assets/email/preview/media/{brand}-logo.webp" alt="{facts["name"]}">
      <p class="entry-kicker">{facts["name"]} Year-End Giveaway · Round 1</p>
      <h1>{facts["question"]}</h1>
      <p class="entry-lead">Answer in one sentence for a chance to win.</p>
    </header>
    <figure class="entry-prize">
      <img src="assets/campaign-prizes/{brand}-1.webp" alt="{facts["prize"]}" width="400" height="400">
      <figcaption><strong>{facts["prize"]}</strong><br>One prize · Approximate retail value {facts["value"]}</figcaption>
    </figure>
    <p class="entry-period">Nov. 23, 10 a.m. to Nov. 29, 11:59 p.m. Eastern Time, 2026</p>
    <p>{entry_status}</p>
    {button}
    <section class="rules" id="official-rules" aria-labelledby="official-rules-title">
      <h2 id="official-rules-title">Official Rules</h2>
      <p><strong>NO PURCHASE NECESSARY TO ENTER OR WIN. A PURCHASE WILL NOT IMPROVE YOUR CHANCES OF WINNING. VOID WHERE PROHIBITED.</strong></p>
      <h2>1. Sponsor and eligibility</h2>
      <p>Sponsor: {facts["sponsor"]}. Contact: <a href="mailto:{facts["email"]}">{facts["email"]}</a>.</p>
      <p>Open to legal residents of the 48 contiguous United States and the District of Columbia who are at least 18 and have reached the age of majority in their state or district at entry. Employees of the sponsor or its promotion administrator and their immediate families and household members are ineligible.</p>
      <h2>2. Entry period and how to enter</h2>
      <p>The entry period starts November 23, 2026, at 10:00 a.m. Eastern Time (ET) and ends November 29, 2026, at 11:59 p.m. ET, including the final minute. The entry form’s timestamp is the official clock.</p>
      <p>Submit your name or nickname, email address, state or district and one original sentence answering “{facts["question"]}” on the entry form. Check the box confirming eligibility and agreement to these rules. Limit one entry per person. Only the first eligible entry counts. Participation on social media or Discord is optional and does not count as an entry.</p>
      <h2>3. Drawing and prize</h2>
      <p>After the deadline, the sponsor will randomly draw one winner and up to two alternates from all eligible entries. Odds depend on the number of eligible entries. Answers are not scored. If there are no eligible entries, no prize will be awarded.</p>
      <p>One prize: {facts["prize"]}. Approximate retail value: {facts["value"]}. The sponsor covers standard shipping to an eligible U.S. address. The winner is responsible for any applicable taxes. The prize is nontransferable and has no cash alternative.</p>
      <h2>4. Notification and claim</h2>
      <p>The sponsor will announce the winner’s anonymous entry ID on this page and in its official Discord server and email the winner privately on November 30, 2026, at 10:00 a.m. ET. Reply to the official notice within 48 hours to claim. The winner will supply a shipping address privately. If the selected entrant is ineligible, declines or misses the claim deadline, the sponsor will contact the next alternate, who also has 48 hours to reply.</p>
      <p>The sponsor will never ask you to pay to claim a prize or ask for a password, verification code, card number or identity document.</p>
      <h2>5. Privacy and responses</h2>
      <p>Entry details are used to administer the giveaway, verify eligibility, contact the winner and deliver the prize. The sponsor may retain records for fulfillment, disputes and applicable legal obligations. Entering does not subscribe you to marketing. Public use of your answer requires separate permission. See the <a href="{facts["privacy"]}">{facts["name"]} Privacy Policy</a>.</p>
      <h2>6. Platform disclosure</h2>
      <p>To the extent permitted by law, entrants release Instagram and Facebook from claims arising from the giveaway. Instagram, Facebook, Threads, X and Discord do not sponsor, endorse or administer this giveaway and are not associated with it. {facts["third_parties"]} are not sponsors.</p>
    </section>
  </main>
</body>
</html>
'''


def update_hub(source, brand, state, form_url):
    status = "已开放" if state == "open" else "尚未开放"
    source = re.sub(r'<p class="round-status">.*?</p>',
                    f'<p class="round-status">{status}</p>', source, count=1)
    buttons = f'<a href="rules-{brand}-r1.html">Official Rules</a>'
    if form_url:
        name = "Entry form" if state == "open" else "Entry form (closed)"
        buttons += f' · <a href="{escape(form_url)}">{name}</a>'
    entry = (
        'One entry per person. Submit your name or nickname, email, state, a one-sentence answer '
        'and agreement to the Official Rules. Discord carries announcements.'
    )
    source, changed = re.subn(
        r'<dt>参加方式</dt><dd>.*?</dd>',
        f'<dt>参加方式</dt><dd>{entry}<br>{buttons}</dd>',
        source, count=1, flags=re.DOTALL,
    )
    if changed != 1:
        raise ValueError("Hub entry section not found")
    if brand == "cozeware":
        source = source.replace("你家哪个角落偏冷或偏热？", "冬天家里哪个角落最冷？")
    return source


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("brand", choices=BRANDS)
    parser.add_argument("state", choices=("closed", "open"))
    parser.add_argument("--form-url", default="")
    parser.add_argument("--output", type=Path, default=ROOT)
    args = parser.parse_args()
    if args.form_url:
        parsed = urlparse(args.form_url)
        if parsed.scheme != "https" or parsed.netloc not in {"forms.gle", "docs.google.com"}:
            parser.error("Use the verified Google Forms respondent URL.")
        if parsed.netloc == "docs.google.com" and not re.fullmatch(
            r"/forms/d/(?:e/)?[a-zA-Z0-9_-]+/viewform", parsed.path
        ):
            parser.error("Use a Google Forms viewform URL, not the editor.")
    if args.state == "open" and not args.form_url:
        parser.error("Open mode requires a verified respondent URL.")
    args.output.mkdir(parents=True, exist_ok=True)
    hub_name = f"campaign-{args.brand}-r1.html"
    source = (ROOT / hub_name).read_text(encoding="utf-8")
    (args.output / hub_name).write_text(
        update_hub(source, args.brand, args.state, args.form_url), encoding="utf-8"
    )
    (args.output / f"rules-{args.brand}-r1.html").write_text(
        public_page(args.brand, args.state, args.form_url), encoding="utf-8"
    )


if __name__ == "__main__":
    main()
