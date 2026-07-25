# CFBD permission request -- draft

**Status:** ready to send. **Action owner:** Rob.
**Send to:** `admin@collegefootballdata.com` (or ask in the CFBD Discord,
https://discord.gg/Eb3ex5a, and follow up by email so there is a written record).
**When:** before the first paid transaction.

## Why this email exists

CFBD's terms (effective 2025-07-01) contain no commercial-use prohibition, and
we are already on Tier 3 -- the tier their own docs point product builders
toward. So "may we build a paid product on CFBD data" is already answered: yes.

The open question is narrower. Their one relevant prohibition is *"Reselling or
redistributing data obtained from the API **without explicit permission**."*
Our architecture is a mirror rather than a live client -- cfb-database's dlt
pipelines persist CFBD data into our own Postgres, and cfb-app serves that
stored data to end users. That is further from a normal API consumer than most
of their subscribers, and once those end users are paying, someone reading the
clause uncritically could land on us.

The clause is conditional, so the fix is to obtain the permission. Exposure
here is contractual and relational -- a revoked key from a solo maintainer, not
a lawsuit -- which is exactly the kind of risk a friendly email resolves and
litigation-style caution does not.

**Keep the reply.** The reply is the deliverable, not the email.

---

## Draft

> **Subject:** Tier 3 subscriber -- checking on storing/serving CFBD data in a paid product
>
> Hi Bill,
>
> I'm a Tier 3 subscriber building CFB Team 360, a college football analytics
> site. I'm planning to put a paid season pass on part of it this season, and I
> want to make sure my setup is squared with your terms before I charge anyone.
>
> How it works: a nightly pipeline pulls from the CFBD API into my own Postgres,
> and the site serves pages and model outputs off that database rather than
> calling the API per request. Practically that means fewer API calls than if I
> queried you live, but it does mean I'm storing your data rather than passing
> it straight through.
>
> What I'm **not** doing, and don't intend to: no bulk export, no CSV download,
> no public API, and nothing that would let someone pull the underlying dataset
> back out. Users get rendered pages, charts, and predictions from my own
> models. There's a "Data: CollegeFootballData.com" credit in the site footer.
>
> Given the terms prohibit redistributing API data without explicit permission,
> I'd rather ask than assume: is the store-and-serve pattern above OK with you
> for a paid product? Happy to adjust anything that isn't, and happy to move up
> a tier if the volume or the use case warrants it.
>
> Thanks for building and maintaining CFBD -- it's the reason this project is
> possible at all.
>
> Rob Stover
> rob.stover@formenteraops.com

---

## Notes on the draft

- **Leads with the tier.** Establishes we pay before asking for anything.
- **Describes the architecture honestly**, including the part that's arguably
  redistribution. Burying it would make the permission worthless if it ever
  mattered.
- **Names the guardrails** (no export, no public API) -- these are the specific
  things that separate "product" from "reseller," and putting them in writing
  makes the reply a commitment on both sides.
- **Offers to upgrade.** Cheap goodwill; also honest, since Tier 3's 75k
  requests/mo is generous for a nightly pipeline and we'd likely be upgrading
  for features rather than volume.
- **Does not ask for a license or use legal language.** This is a note to a
  person who runs a Patreon, not a contract negotiation. Anything that reads
  like a demand letter gets a worse outcome.

## After the reply

- File the reply somewhere durable (not just an inbox) and link it here.
- If the answer is yes: tick the CFBD item in
  `docs/MONETIZATION_ROADMAP.md` Phase 0 and note the date.
- If the answer is conditional: fold the conditions into the roadmap before
  Phase 2 ships, since they may constrain what the paid tier can show.
- If there's no reply after ~2 weeks: follow up once in the Discord. Silence is
  not permission, but a documented good-faith attempt is materially better than
  nothing if the question is ever raised.
