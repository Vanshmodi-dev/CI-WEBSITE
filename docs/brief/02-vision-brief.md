# Commerce Insight — Vision Brief

> **Provenance:** Drafted in ChatGPT, reviewed and approved by Vansh (TradyPerch), 21 August 2026.
> **Status:** Source document. Preserved verbatim — do not edit the body. Corrections and
> decisions go in `docs/MASTER-PLAN.html`, not here.
> **Role:** This is the *wish list* — what we want the website to be. It sits alongside
> `01-master-directive.md` (the formal build directive) as client-side input.

> ⚠️ **Read before building from this document.**
> Every number, name and score below is an **illustrative placeholder**, not data.
> `5000+ Students`, `18+ Years`, `95%+ Success Rate`, `100+ Toppers`, `4.9★`,
> `Rahul Sharma 98.6%`, `98.6% Class 12` — all of these are examples of *shape*, not
> facts about Commerce Insight. The document says so itself ("actual numbers sir se
> verify karenge. Fake numbers bilkul nahi."). Nothing here reaches the website until
> the institute confirms it in writing. See Section 0 of the Master Plan for why this
> warning exists.

---

## 🧠 Pehle vision lock karte hain

Main Commerce Insight ko imagine kar raha hoon as:

A premium, trustworthy, result-driven coaching institute website that makes a student/parent think: **"Yahan admission lena chahiye."**

Not:

"Ek coaching centre ki normal website jisme About, Courses aur Contact hai."

Difference bahut bada hai.

Website ko simultaneously 4 kaam karne chahiye:

1. Students ko convince karna
2. Parents ko trust dena
3. Sir ki personal brand build karna
4. Commerce Insight ko Google/YouTube/social ecosystem ke centre mein lana

Aur 5th hidden objective:

### 🚀 TradyPerch ko indirectly showcase karna

Agar koi aur coaching owner ye website dekhe aur bole:

"Bhai, mujhe bhi aisi website chahiye."

Boom.
Referral → TradyPerch client.

---

## 🏗️ Website Architecture

Main roughly ye structure recommend karunga:

```
COMMERCE INSIGHT
│
├── Home
│
├── About
│   ├── About Commerce Insight
│   ├── Director / Faculty
│   ├── Our Philosophy
│   └── Why Commerce Insight
│
├── Courses
│   ├── All Courses
│   ├── Class 11 Commerce
│   ├── Class 12 Commerce
│   ├── CA Foundation
│   └── Other Courses
│
├── Results
│   ├── Board Results
│   ├── CA Results
│   ├── Toppers
│   └── Student Achievements
│
├── Faculty
│
├── Students
│   ├── Testimonials
│   ├── Student Stories
│   └── Achievements
│
├── Media
│   ├── YouTube
│   ├── Videos
│   ├── Gallery
│   └── Updates
│
├── Resources
│   ├── Notes
│   ├── Important Updates
│   └── Announcements
│
├── Contact
│   ├── Location
│   ├── Enquiry
│   ├── Call
│   └── WhatsApp
│
└── Enquiry / Admission
```

But — isko unnecessarily 20 pages ka monster nahi banana.

Some sections can be dynamic.

---

## 🏠 1. HOME PAGE

Home page sabse important hai.

Main isko roughly 10–12 sections mein structure karunga.

### Section 1 — Hero

Ye sabse premium part hona chahiye.

Not:

```
Welcome to Commerce Insight
Best Commerce Coaching Institute
```

Boring. 😭

Instead:

**Master Commerce. Build Your Future.**

Supporting copy:

Expert guidance, structured learning and result-oriented preparation for Commerce students.

And immediately:

`[Explore Courses]` `[Talk to Us]`

Side mein:

- Sir ki professional photograph
- classroom image/video
- subtle academic graphics
- result/toppers visual

Background overly flashy nahi.

Premium + academic + trustworthy.

### 🏆 Section 2 — Trust Bar

Hero ke immediately baad.

Something like:

```
5000+ Students
18+ Years Experience
95%+ Success Rate
100+ Toppers
4.9★ Google Rating
```

Obviously actual numbers sir se verify karenge.

**Fake numbers bilkul nahi.**

This gives instant credibility.

### 🎯 Section 3 — Why Commerce Insight?

Yahan hum institute ka USP explain karenge.

Cards:

**Concept First** — Ratta nahi — concepts samajhna.

**Personal Attention** — Student ki individual progress.

**Exam Focused** — Boards / competitive preparation.

**Experienced Faculty** — Experienced teachers and structured guidance.

**Doubt Support** — Student ko stuck nahi rehne dena.

**Result Driven** — Performance tracking + consistent preparation.

Again, actual offerings sir se verify.

### 📚 Section 4 — Courses

This should be a real course system, not 4 random cards.

Example:

- **Class 11 Commerce** — Subjects / curriculum / batches
- **Class 12 Commerce** — Boards + preparation
- **CA Foundation** — Foundation preparation
- **Other Programs** — Whatever Commerce Insight actually offers.

Each card:

`Course → View Details`

And clicking opens:

```
/course/class-12-commerce
```

Not a popup.

This is one of the biggest differences from the Lovable website.

### 🏅 Section 5 — Results / Toppers

Bhai THIS can be one of the strongest sections.

Big visual section.

Something like:

**Our Students. Their Success.**

Then topper cards:

```
[PHOTO]

98.6%
Class 12 Commerce

Student Name
Year 2026
```

Could have:

`View All Results →`

which opens:

```
/results
```

There we can have:

```
2026
2025
2024
2023
```

filters.

### ⭐ Section 6 — Google Reviews

And THIS is where our Review Engine becomes valuable.

Instead of manually entering testimonials:

```
★★★★★

"Commerce Insight helped..."
— Student Name
Google Review
```

The backend pulls verified reviews and website displays them.

Potentially:

**What Our Students & Parents Say**

Then:

`View all Google Reviews →`

And a small:

`★ 4.9 Google Rating`

Again, only actual rating.

This is a killer feature because the website isn't just displaying static testimonials.

It is connected to the institute's real-world reputation.

### 🎥 Section 7 — YouTube

Since sir has started his YouTube channel, we absolutely should use it.

Not just:

"Follow us on YouTube"

No.

We make it part of the ecosystem.

**Learn Beyond the Classroom**

Latest videos:

`[Video] [Video] [Video]`

Each card:

- Thumbnail
- title
- category
- date
- Watch on YouTube

And:

`Visit YouTube Channel →`

Eventually we can automate latest-video fetching too.

### 👨‍🏫 Section 8 — Meet the Faculty

This makes the institute feel human.

Example:

```
Meet Your Mentors

[Sir photo]
Name
Founder / Director
Specialisation

[Faculty]
Name
Subject
```

Click faculty:

```
/faculty/name
```

with:

- experience
- qualifications
- subjects
- teaching philosophy
- achievements

### ❤️ Section 9 — Student Stories

Different from Google Reviews.

Google Reviews = external validation.

Student Stories = marketing storytelling.

Example:

**From struggling with Accounts to scoring 95+.**

Student image.

Short story.

Then:

`Read Student Story`

This can become a beautiful `/students` section.

### 📸 Section 10 — Campus / Gallery

Visual proof.

Categories:

```
All
Classrooms
Events
Students
Achievements
Seminars
Celebrations
```

Images in masonry/grid.

This makes the institute feel alive.

### 📍 Section 11 — Location

Now we bring in Google Maps.

But instead of:

"Here's our location."

We make it useful:

**Find Commerce Insight**

Map +:

- address
- timings
- phone
- WhatsApp
- directions

And:

`Get Directions`

### 📞 Section 12 — Final CTA

The website should end with a strong conversion.

Something like:

**Ready to take the next step?**

Talk to our team about courses, batches and admissions.

Buttons:

- Enquire Now
- Call Us
- WhatsApp

---

## 📄 ABOUT PAGE

Now we tell the actual story.

Structure:

```
About Commerce Insight
        ↓
Our Story
        ↓
Our Mission
        ↓
Our Teaching Philosophy
        ↓
Why Students Choose Us
        ↓
Our Faculty
        ↓
Our Achievements
        ↓
CTA
```

And importantly:

**Sir ki story.**

A coaching institute becomes much more trustworthy when people know who is behind it.

---

## 📚 COURSES SYSTEM

This deserves proper architecture.

Instead of just cards, each course should have its own page.

Example:

```
/courses/class-12-commerce
```

Page:

```
Course Hero
↓
Who is this course for?
↓
Subjects
↓
What You'll Learn
↓
Teaching Methodology
↓
Batch Information
↓
Faculty
↓
Course Benefits
↓
FAQs
↓
Enquiry CTA
```

This also gives us SEO pages.

Someone searching:

"commerce coaching in Jaipur"

or

"class 12 commerce coaching"

can potentially land directly on the relevant page.

---

## 🏆 RESULTS PAGE

This could become one of the site's best pages.

Hero:

**Results That Speak For Themselves**

Then:

```
Overall statistics

98%
Highest Score

XXX+
Successful Students

XXX+
Toppers

XX+
Years
```

Then result grid.

Filters:

```
2026
2025
2024
2023
```

And categories:

```
Class 12
Class 11
CA Foundation
Other
```

---

## 👨‍🎓 TOPPERS

Dedicated topper cards.

But here's a cool idea.

Instead of only:

`98.6% — Rahul`

We create **Topper Profiles**.

Example:

```
Rahul Sharma

98.6%

Accounts       99
Economics      98
BST            99

"Short testimonial..."

[View Story]
```

This gives the website much more personality.

---

## 🎥 YOUTUBE PAGE

```
/youtube
```

Could have:

```
Latest Videos
Most Popular
Accounts
Economics
Business Studies
Exam Preparation
```

And every video opens the YouTube video.

Eventually this can be automatically populated.

---

## ⭐ REVIEWS PAGE

```
/reviews
```

This is where our Review Engine shines.

Imagine:

```
Google Rating

★★★★★
4.9 / 5

Based on XXX Google Reviews
```

Then:

```
All
Students
Parents
Recent
```

Reviews automatically sync.

And:

`Leave us a Google Review →`

This is actually useful for the client's business.

---

## 📸 GALLERY

```
/gallery
```

Modern masonry layout.

But we need to avoid the classic coaching website:

48 random photos in a grid 💀

Instead:

**Stories through visuals.**

Categories + fullscreen viewer.

---

## 📞 CONTACT / ENQUIRY

This should be conversion-focused.

Not just:

```
Address
Phone
Email
```

Instead:

**Have a question?**

Form:

```
Name
Phone
Class
Course Interested In
Message
```

Then:

`Submit Enquiry`

Potential backend:

```
Website
   ↓
API
   ↓
Database
   ↓
Admin Dashboard
```

So sir can actually see leads.

---

## 🧠 AND THIS IS WHERE I'D TAKE IT ONE LEVEL HIGHER

Bhai, agar hum already scratch se bana rahe hain...

website ko static website mat banana.

Let's build it like a **mini coaching platform**.

### ⚡ Dynamic Content Architecture

The website should eventually have:

```
ADMIN PANEL
     │
     ├── Courses
     ├── Faculty
     ├── Results
     ├── Toppers
     ├── Reviews
     ├── YouTube
     ├── Gallery
     ├── Announcements
     └── Enquiries
             │
             ↓
          DATABASE
             │
             ↓
      COMMERCE INSIGHT
          WEBSITE
```

Then sir doesn't have to call you every time:

"Beta ek topper add karna hai."

😂

He can do it himself.

---

## 🤖 AUTOMATIONS

And this is where your TradyPerch work becomes genuinely impressive.

**Google Reviews**

```
Google Business Profile
        ↓
Review Engine
        ↓
Database
        ↓
Website
```

**YouTube**

Potentially:

```
YouTube Channel
        ↓
YouTube API
        ↓
Backend
        ↓
Latest Videos
        ↓
Website
```

**Enquiries**

```
Website
 ↓
Lead
 ↓
Database
 ↓
Admin
 ↓
Notification
```

Eventually:

```
Lead
 ↓
WhatsApp
 ↓
Follow-up
```

Obviously we'll build this progressively.

---

## 🎨 DESIGN DIRECTION

This part is VERY important.

I don't want:

- ❌ Neon gradients everywhere
- ❌ Huge animated text
- ❌ Random 3D objects
- ❌ Overuse of glassmorphism
- ❌ Generic AI-generated coaching website
- ❌ 20 different animations
- ❌ "Best coaching institute since XYZ" everywhere

I want:

**Premium educational brand.**

Think:

Apple-level cleanliness + modern edtech + serious academic credibility.

### 🎨 Visual language

Potential direction:

**Primary** — Deep navy / charcoal

**Accent** — Warm gold / amber

**Background** — Off-white / very light neutral

**Text** — Dark charcoal

**Secondary** — Muted grey.

But we shouldn't lock exact colours yet until we see Commerce Insight's existing logo/brand identity.

### ✨ Animations

Subtle.

For example:

- **Hero** — Text fades/slides in.
- **Cards** — Tiny hover elevation.
- **Numbers** — Count-up animation.
- **Images** — Soft reveal.
- **Page transitions** — Smooth.
- **Results** — Numbers animate when entering viewport.

No animation just because "we can animate it."

---

## 📱 MOBILE FIRST

This is non-negotiable.

Most students/parents will probably discover the institute through:

```
Instagram → WhatsApp → Website
```

on their phones.

So mobile needs to feel like a first-class experience.

Not:

Desktop website squeezed into 390px. 😭

---

## 🔍 SEO

This website should also be designed to rank.

We'll eventually need:

- Homepage SEO
- Course SEO
- Location SEO
- Result SEO
- Faculty SEO
- YouTube/video SEO

Plus:

- sitemap
- robots.txt
- structured data
- OpenGraph
- metadata
- canonical URLs
- proper heading hierarchy
- fast loading
- image optimization

And importantly:

**Google Business Profile ↔ Website consistency**

Name, address, phone, etc. should remain consistent.

---

## 🧩 TECH STACK

Since we're building from scratch, I'd go with something like:

**Frontend** — Next.js + TypeScript

instead of a simple React SPA.

Why?

SEO + routing + performance + scalability.

**Styling** — Tailwind CSS

**UI** — Custom design system.

**Backend** — Can be: Next.js backend/API, or separate Node backend depending on how much functionality we eventually need.

**Database** — PostgreSQL.

**CMS/Admin** — Custom admin dashboard.

**Images** — Proper image storage/CDN.

**Reviews** — Your existing Review Engine.

**YouTube** — YouTube API.

**Maps** — Google Maps / embed depending on exact requirements.

---

## 🗂️ THE ACTUAL WEBSITE

So ultimately I see this:

```
commerceinsight.in
│
├── /
│
├── /about
│
├── /courses
│   ├── /class-11
│   ├── /class-12
│   └── /ca-foundation
│
├── /results
│
├── /toppers
│
├── /faculty
│
├── /students
│
├── /reviews
│
├── /youtube
│
├── /gallery
│
├── /resources
│
├── /contact
│
└── /enquiry
```

And behind it:

```
/admin
```

---

## 🏗️ OUR BUILD PROCESS

### PHASE 1 — Discovery

We first collect everything about Commerce Insight:

logo, brand colours, institute story, courses, subjects, faculty, results, toppers, photos, testimonials, Google Business Profile, address, phone, WhatsApp, YouTube, social media, FAQs, admission process, achievements, USP, target students, target parents

### PHASE 2 — Website Strategy

We'll define:

- Site map
- User journeys
- Conversion strategy
- SEO strategy
- Content architecture

### PHASE 3 — Design System

We'll create:

colours, typography, spacing, buttons, cards, forms, navigation, footer, badges, testimonial components, topper components, course components, result components, responsive behaviour

### PHASE 4 — UI/UX

Then we design every page.

Not just homepage.

### PHASE 5 — Technical Architecture

Then:

Frontend, Backend, Database, Admin, Review Engine, YouTube, Maps, Analytics, Lead system

### PHASE 6 — Build

Then Claude can actually build it.

And this time Claude gets a proper specification, not:

"Make me a premium coaching website."

😂

### PHASE 7 — Audit

Then we do exactly what we've done with Modi Store:

```
security audit → functionality audit → UX audit → performance audit → SEO audit → mobile audit
```

---

## 🚀 And one more thing, brother

Because Commerce Insight is your first client, I would deliberately make this website slightly more sophisticated than what the client initially asked for.

Not by adding useless features.

But by making the fundamentals exceptionally good.

The client should be able to look at it and think:

"Maine website banwane ke liye paise diye the... ye toh proper digital platform bana diya."

And then when another coaching owner asks him:

"Bhai website kisne banayi?"

He says:

**"TradyPerch ne."**

That's the actual win. 😎
