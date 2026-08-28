# Reviewing the website — a walkthrough

**For:** the person deciding whether this website is right.
**You do not need to know anything about the code.**

This is a **candidate release running on your own machine**. It is not live,
nothing here is on the internet, and no real student, teacher or photograph is
involved. Everything you will see is synthetic demonstration data marked
`ZZSHOW`.

Take as long as you like. Nothing you do here can break anything.

---

## 1 · Starting it up

Four commands, in this order, from the project folder.

```bash
npm ci                  # once, the first time
npm run db:test         # starts a local database, leave this window open
```

Then in a **second** terminal:

```bash
npm run db:migrate      # creates the tables, once
npm run seed:demo       # fills the site with demonstration content
npm run dev             # starts the website
```

Open **<http://localhost:3000>**.

To stop: press `Ctrl-C` in each window.

### If you want a fresh start at any point

```bash
npm run seed:demo:clean   # removes every ZZSHOW row and nothing else
npm run seed:demo         # puts it back exactly as before
```

Running `npm run seed:demo` twice does **not** create duplicates. It reconciles.

---

## 2 · Signing in to the admin

There is **no default password**, deliberately — the project never ships one.
Create your own local account:

```bash
npm run create-admin "you@example.invalid" "Sir"
```

It asks for a password at the prompt and never shows it on screen. Use anything
you like; it exists only in your local database.

Then go to **<http://localhost:3000/admin/login>**.

---

## 3 · What you should see — the public website

Visit each page and judge it. What to look at, and what is *meant* to be there:

| Page | What to look for |
| --- | --- |
| **[Home](http://localhost:3000/)** | The hero, then the four figures, then "Why this institute", then results, batches, stories, teachers, videos, gallery, and finally the address. Every band disappears when it has nothing to show |
| **[About](http://localhost:3000/about)** | Two sections. The heading *and* the paragraphs are both yours to edit |
| **[Courses](http://localhost:3000/courses)** | Five programmes. Click one — each has its own page |
| **[Results](http://localhost:3000/results)** | 36 published results, paginated, filterable. Some show a photograph, some show only initials, some show no name at all — that is the permission system working |
| **[Stories](http://localhost:3000/stories)** | 13 published student stories, out of 15 |
| **[Updates](http://localhost:3000/announcements)** | Notices. One is dated in the future and correctly does **not** appear |
| **[Teachers](http://localhost:3000/faculty)** | Four teachers. The fifth is a draft and is not here |
| **[Gallery](http://localhost:3000/gallery)** | Eight photographs, filterable. Four more exist as drafts and are correctly absent — two of those also have no photograph permission recorded, so they could not be published even if you ticked "show on website" |
| **[Videos](http://localhost:3000/videos)** | Four videos, filterable by subject |
| **[Reviews](http://localhost:3000/reviews)** | **Deliberately empty.** The review system is not switched on, so the page says so plainly rather than inventing reviews |
| **[Contact](http://localhost:3000/contact)** | Address, phone, hours, and a map that stays a grey panel until you click "Show the map" — nothing is sent to Google until you ask |
| **[Admissions](http://localhost:3000/admissions)** | The enquiry form. Fill it in; the enquiry appears in the admin |

### Things that are empty on purpose

If a page looks sparse, check this list before calling it a bug:

- **Reviews** — the engine is not activated.
- **Email address** — you have not supplied one.
- **Opening hours** — you have not supplied them.
- **Social links** — you have not supplied them.
- **Video thumbnails are blank tiles.** The demo video IDs are invented, so
  YouTube has no picture for them. With a real video ID a real poster appears.

The rule this site follows throughout: **show nothing rather than something
invented.** Every blank above is a fact nobody has confirmed yet.

---

## 4 · What you should see — the admin

Sign in, then work down the left-hand menu.

| Screen | What it is for |
| --- | --- |
| **Dashboard** | New enquiries, what is published, what is waiting |
| **Enquiries** | People who used the form. Open one, set a status, add a note |
| **Students & results** | Add and edit results. Every permission is a separate tick box |
| **Student stories** | The longer written stories |
| **Website text** | Every word on the site you can change, grouped by page |
| **Website preview** | The same list, arranged the way the website is. Edit anything in place |
| **Faculty · Gallery · Videos · Batches · Announcements** | One list each, with Add and Edit |
| **Photos** | Every uploaded photograph, and what is using it |
| **Import & export** | Bring results in from a spreadsheet, take any table out |

---

## 5 · Eighteen things to actually try

Do these in order. Each one tells you what you should see.

**1 · Change the homepage heading.**
Admin → *Website preview* → find "Hero headline" → **Edit** → change it → **Save
changes**. Expect: a confirmation, and the dialog closes.

**2 · Check the public page changed.**
Open <http://localhost:3000/> in a **private/incognito window** (so you are not
signed in). Expect: your new heading, immediately.

**3 · Add a teacher.**
Admin → *Faculty* → **Add teacher**. Fill in a name and a designation. Tick
"Show this teacher on the website". Save. Expect: they appear on
<http://localhost:3000/faculty>.

**4 · Upload a photograph.**
Edit that teacher → **Choose photo** → pick any image from your computer.
Expect: a thumbnail appears within a second or two, and the status line reports
the size and dimensions.

**5 · Replace it.**
Click **Replace photo** and choose a different image. Expect: the thumbnail
changes. The old photograph is *not* deleted — it stays in the library.

**6 · Use a photograph you already uploaded.**
Click **Choose an uploaded photo**. Expect: a window showing every photograph
you have uploaded. Pick one. Press `Escape` to close it — that should work too.

**7 · Add a gallery photograph.**
Admin → *Gallery* → **Add photograph**. Note the field says **(required)** — a
gallery entry without a photograph is refused, and it tells you so. Also note
"Does this photograph show people?" is ticked **by default**: that is the safe
assumption, and it forces you to record a permission before publishing.

**8 · Add a video.**
Admin → *Videos* → **Add video**. Paste any YouTube link. Expect: a preview
appears confirming which video it resolved to. (With an invented ID the picture
will be blank — see §3.)

**9 · Change the address.**
Admin → *Website preview* → the "Address" fields. Change the street. Expect: the
contact page, the footer and the homepage all change together.

**10 · Test directions.**
<http://localhost:3000/contact> → **Get directions**. Expect: Google Maps opens
in a new tab, aimed at the point in the demo data.

**11 · Look at the reviews diagnostics.**
Admin → *Reviews*. Expect: a plain explanation that the review engine is not
switched on for this client, and what would happen if it were. No fake reviews.

**12 · Export your data.**
Admin → *Import & export* → download any of the five files. Open one in Excel.
Expect: readable columns, no internal identifiers, no passwords.

**13 · Import a spreadsheet.**
Same screen → download the **template**, add a row, upload it. Expect: a preview
of what *would* change, before anything is written. Nothing imported is ever
published automatically.

**14 · Delete a record.**
Open any teacher → scroll to the bottom → **Delete this teacher**. Expect: it
asks first, and only deletes after you confirm.

**15 · Try to delete a photograph that is in use.**
Admin → *Photos*. Find one that says "Used by…". Expect: **no delete button**,
and a sentence telling you which records are holding it. This is the protection
that stops a photograph disappearing from a live page.

**16 · Withdraw permission for a student photograph.**
Admin → *Students & results* → open one that has a photograph → untick the
photograph permission → Save. Expect: the photograph disappears from
<http://localhost:3000/results> immediately.

> **This is the flow that matters most.** A parent asking you to take their
> child's photograph down is answered by this tick box, and it takes seconds.
> If they want the file itself gone as well, that is a second step —
> Admin → *Photos* → Delete. The full procedure is in
> `docs/DEPLOYMENT-HUMAN-CHECKLIST.md`.

**17 · Sign out.**
Expect: back to the login page, and pressing Back does not show admin content
again.

**18 · Browse as a stranger.**
In a private window, visit <http://localhost:3000/admin>. Expect: the login
page. Nothing behind it is reachable.

---

## 6 · Looking at it properly

Please look at the site at more than one size. In Chrome: `F12`, then the
phone/tablet icon, then set the width.

| Width | Why |
| --- | --- |
| **360px** | The commonest Android phone in India. Most of your visitors |
| **390px** | A typical iPhone |
| **768px** | A tablet, or a phone turned sideways |
| **Desktop** | A laptop |

Worth judging at each size:

the hero · typography and how comfortable it is to read · the colours ·
the space between sections · the cards · the buttons · the navigation menu ·
the footer · the photographs · the enquiry form · the results table ·
the admin dashboard · the admin forms · the edit dialog · the mobile menu

**Also try both light and dark.** The site follows your system setting, and both
have been checked for readable contrast — but you should decide whether you like
the dark one.

If something looks wrong to you, it is worth saying so even if it is small.
Nothing here has been designed to your taste yet — that is what this review is
for.

---

## 7 · What is *not* finished, and why

None of these is a bug, and none can be fixed by more programming.

| | Waiting on |
| --- | --- |
| The real institute facts — address, phone, email, opening hours, Google listing | **You.** Seven of them. The site shows nothing rather than guessing |
| The four figures under the hero | **You.** They are demonstration numbers today. Give me real ones or say there will be none |
| The "Why this institute" points | **You.** Same |
| Real teachers, real photographs, real results | **You**, with the permissions to publish them |
| Photograph storage that survives a deploy | A Cloudflare account. Free, but needs a payment card on file |
| Live Google reviews | Google credentials that only you can grant |
| A domain name | **You** |

---

## 8 · When you are finished

Write down what you want changed. Anything at all — wording, spacing, colour,
order of sections, a page that should exist, a page that should not.

Then answer these, which nobody but you can:

1. Are the four figures under the hero real, or should the band go?
2. Are the "Why this institute" points right, or should they say something else?
3. Do you want a **Resources** page (notes, study material)?
4. Do you want an **FAQ** section?
5. Who, by name, handles a parent asking for a photograph to be removed?
6. How long should enquiries be kept before they are deleted?

Nothing goes live until you say so. The switch that publishes this site to
Google is off, and it stays off until you have signed off on the content.
