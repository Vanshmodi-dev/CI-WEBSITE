# COMMERCE INSIGHT — MASTER WEBSITE BLUEPRINT & BUILD DIRECTIVE

> **Provenance:** Issued by Vansh (TradyPerch), 21 August 2026, as the formal build directive.
> **Status:** Source document. Preserved verbatim — do not edit the body.
> Decisions and corrections live in `docs/MASTER-PLAN.html`.
> **Role:** The project's constitution — vision, quality bar, architecture, and the
> content-integrity rules (§42) that override everything else.

> ⚠️ Placeholder values in this document (`[CLIENT TO PROVIDE]`, example metrics,
> example scores) are shape, not data. §42 is the rule that governs them.

---

## MASTER INSTRUCTION FOR CLAUDE

You are acting as the **Lead Product Designer, UX Strategist, Brand Designer, Technical Architect, SEO Strategist, and Senior Full-Stack Engineer** for a premium website project for **Commerce Insight**, a commerce education/coaching institute.

This document is the **single source of truth and master blueprint** for the project.

Do not treat this as a request to make a generic coaching website.

The objective is to build a **premium, trustworthy, modern, result-driven digital platform for Commerce Insight** that can become the institute's primary digital presence and conversion engine.

The website must feel significantly more sophisticated, intentional, and polished than a typical Indian coaching institute website.

---

## 1. PROJECT CONTEXT

Commerce Insight is a coaching/education institute focused on Commerce education.

The previous website was created as a simple single-page website using an AI website builder. Although it contained elements such as Courses, Google Maps location, Google Reviews, Contact information, and other basic institute information, the result did not feel sufficiently premium, differentiated, or scalable.

That previous website is being discarded.

We are rebuilding Commerce Insight's website **from scratch**.

The new website must be a **multi-page website**, not a single-page brochure.

Commerce Insight's founder/director has also started a YouTube channel, which should become an integrated part of the website rather than merely a social-media link.

The website should eventually incorporate: Courses, Results, Toppers, Faculty, Student stories, Google Reviews, YouTube content, Gallery, Institute information, Resources, Contact, Enquiries/admissions, Location, and potentially announcements and other useful educational content.

There is also an existing custom **Google Review Engine** built for this project. Its purpose is to retrieve Google Business Profile reviews and make them available for display on the Commerce Insight website. The website should be architected so this review system can become a real integration rather than manually hard-coded testimonials.

---

## 2. PRIMARY BUSINESS OBJECTIVE

### 2.1 Convert Students

A student visiting the website should quickly understand: what Commerce Insight offers, which course is relevant to them, why the institute is different, what the teaching experience is like, what results students have achieved, and how they can enquire/admit.

The website should make the next step obvious.

### 2.2 Build Parent Trust

Parents should immediately see: credibility, faculty, results, student achievements, reviews, institute information, location, contact details, professionalism.

The site must communicate that Commerce Insight is a serious educational institution.

### 2.3 Build the Director's/Institute's Brand

Commerce Insight should not feel like an anonymous coaching centre. The people behind the institute should have a visible presence. The founder/director and faculty should be presented professionally. The YouTube channel should strengthen this personal and educational brand.

### 2.4 Generate Business for TradyPerch

Commerce Insight is an early client project for **TradyPerch**, a digital agency that builds websites, apps, AI agents, agentic AI systems, and custom software.

The Commerce Insight website should therefore be built at a quality level that can become a **portfolio/showcase project for TradyPerch**.

If another coaching institute, education business, or local business sees this website and asks who built it, the desired outcome is:

> "TradyPerch built it."

Therefore, do not build this like a cheap template website. Build it like a flagship client project.

---

## 3. BRAND IDENTITY

The official Commerce Insight logo has been provided to you. The logo contains: deep academic blue, white, orange accent, book/education symbolism, student/graduation symbolism, pen/nib symbolism.

The visual identity of the website must be derived from this logo.

### PRIMARY BRAND DIRECTION

**Primary colors:** Deep Blue + White. These are the dominant brand colors. The website should clearly feel like a **blue-and-white Commerce Insight website**.

**Accent color:** The orange from the logo may be used as a **controlled accent** — small highlights, active indicators, important micro-elements, selected CTAs where appropriate, decorative lines, small badges, achievement accents.

Do NOT make orange a dominant website color. The overall visual identity must remain:

> **Blue + White first, Orange second.**

---

## 4. DESIGN PHILOSOPHY

The target aesthetic is **Premium Educational Brand**.

Think: modern edtech, serious academic credibility, high-end institutional design, clean editorial layouts, strong typography, excellent photography, subtle motion, excellent spacing, strong visual hierarchy.

The website should feel somewhat like the intersection of **premium technology design + modern edtech + established academic institution** but must retain Commerce Insight's own identity.

---

## 5. WHAT TO AVOID

Absolutely avoid creating a generic AI-generated coaching website.

Do NOT rely on: excessive gradients, neon colors, random 3D objects, excessive glassmorphism, giant meaningless animations, too many floating shapes, generic stock education illustrations, fake statistics, generic motivational quotes everywhere, excessive rounded cards, overloaded pages, random animations just for visual effect, template-like layouts, poor mobile adaptation, "best coaching institute" claims without evidence, fake testimonials, invented results, invented faculty credentials.

Do not sacrifice clarity for visual effects.

The website should communicate **Trust + Results + Expertise + Modernity** rather than **"Look how many animations we can make."**

---

## 6. CORE WEBSITE PRINCIPLE

The website should NOT feel like: "Here is information about our coaching institute."

It should feel like: "Here is the complete digital experience of Commerce Insight."

That means the website should connect Students, Parents, Courses, Faculty, Results, Toppers, Reviews, YouTube, Gallery, Enquiries, Location, and Institute Brand into one coherent ecosystem.

---

## 7. MULTI-PAGE INFORMATION ARCHITECTURE

```
/
├── Home
├── About
│   ├── About Commerce Insight
│   ├── Our Story
│   ├── Mission / Vision
│   ├── Teaching Philosophy
│   └── Why Commerce Insight
├── Courses
│   ├── All Courses
│   ├── Class 11 Commerce
│   ├── Class 12 Commerce
│   ├── CA Foundation
│   └── Other Courses
├── Results
├── Toppers
├── Faculty
├── Students
│   ├── Testimonials
│   └── Student Stories
├── Reviews
├── YouTube / Media
├── Gallery
├── Resources
├── Contact
└── Enquiry / Admission
```

This structure is a starting architecture. Do not blindly create every page if actual business requirements indicate that some information should be combined. However, do NOT collapse the entire experience back into a single-page website.

---

## 8. HOMEPAGE BLUEPRINT

The homepage should be the strongest page on the website. It should function as: brand introduction, trust builder, course discovery page, results showcase, social proof system, YouTube gateway, conversion page.

### 8.1 HERO

The hero should immediately communicate what Commerce Insight is, what it offers, why the visitor should care, and what action they can take.

Possible positioning direction:

> Master Commerce. Build Your Future.

This is a directional concept, not necessarily final copy.

Potential CTAs: **Explore Courses**, **Talk to Us**

The hero may feature professional institute/faculty photography, classroom imagery, student imagery, carefully designed academic visual elements.

Do not make the hero excessively busy.

---

## 9. TRUST / CREDIBILITY BAR

Immediately after the hero, introduce verified credibility metrics: Students, Years of Experience, Success Rate, Toppers, Google Rating.

BUT: **Never invent these numbers.** Every statistic must be supplied or verified by the Commerce Insight team. The UI should be designed so these values can be dynamically updated later.

---

## 10. WHY COMMERCE INSIGHT

Create a strong value-proposition section. Potential pillars:

- **Concept First** — Students understand concepts rather than relying purely on memorisation.
- **Personal Attention** — Individual student support where actually offered.
- **Exam Focused** — Structured preparation for relevant examinations.
- **Experienced Faculty** — Qualified and experienced educators.
- **Doubt Support** — Accessible doubt-solving/support systems where actually available.
- **Result Driven** — A learning system designed around measurable student progress.

These are strategic concepts. Do not claim a feature exists until Commerce Insight confirms it.

---

## 11. COURSES SECTION

The homepage should introduce courses with premium course cards. Potential courses: Class 11 Commerce, Class 12 Commerce, CA Foundation, other relevant programs.

Only display courses actually offered by Commerce Insight. Each course should have a dedicated route/page where appropriate:

```
/courses/class-11-commerce
/courses/class-12-commerce
/courses/ca-foundation
```

---

## 12. COURSE DETAIL PAGE

```
Course Hero → Who Is This Course For? → Course Overview → Subjects →
What Students Will Learn → Teaching Methodology → Faculty →
Batch Information → Course Benefits → FAQs → Enquiry CTA
```

Do not fill missing information with assumptions. Use placeholders or clearly identify required client information.

---

## 13. RESULTS SECTION

Results should be one of the strongest sections of the entire website.

Positioning: **Our Students. Their Success.** or another strong, evidence-based message.

Showcase: highest scores, important achievements, successful students, year-wise results, subject-wise achievements where appropriate.

Only use verified results.

---

## 14. RESULTS PAGE

Create a dedicated `/results` page with potential filters by year (2026, 2025, 2024, 2023) and categories (Class 11, Class 12, CA Foundation, Other) depending on actual data.

Results should be structured as data rather than hard-coded decorative content whenever practical.

---

## 15. TOPPERS

Create a dedicated topper/achievement experience.

```
[Student Photo]
98.6%
Class 12 Commerce
Student Name
Year
```

Where appropriate, topper profiles can contain: student name, score, subjects, achievement, short testimonial, student story.

```
Accounts       99
Economics      98
BST            99
```

Only use real data. **Never manufacture marks.**

---

## 16. FACULTY

Create a professional faculty section. Homepage: **Meet Your Mentors**

Faculty cards: photograph, name, position, subject, specialisation.

Dedicated faculty pages: qualifications, experience, teaching philosophy, subjects, achievements, relevant professional information.

Only publish verified information.

---

## 17. GOOGLE REVIEWS

Commerce Insight has a custom Google Review Engine. This must be treated as a major integration.

```
Google Business Profile → Review Engine → Backend / Database → Commerce Insight Website
```

The website should NOT permanently depend on manually copied review text. The system should be capable of displaying actual Google reviews.

Homepage section: **What Our Students & Parents Say**

Potentially show: Google rating, review count, recent reviews, reviewer name, review date, rating, review content.

Dedicated route: `/reviews`

Potential review filters: All, Recent, Students, Parents. Only implement filters if the underlying data supports reliable categorisation.

CTA: **Leave us a Google Review** — pointing to the appropriate official review destination once configured.

---

## 18. STUDENT TESTIMONIALS VS GOOGLE REVIEWS

**Google Reviews** = external social proof. **Student Stories** = owned editorial content.

A student story can be much deeper:

> From struggling with Accounts to achieving X.

```
Student → Challenge → Learning Journey → Result → Student Experience
```

Only create these stories using real student information and consent where required.

---

## 19. STUDENTS PAGE

Potential sections: Student Stories, Testimonials, Achievements, Experiences, Success journeys.

This page should make the institute feel human.

---

## 20. YOUTUBE INTEGRATION

The website should treat YouTube as part of the educational ecosystem. Do not simply add "Follow us on YouTube." Instead create a meaningful content section.

Homepage: **Learn Beyond the Classroom**

Display: latest videos, video thumbnails, titles, categories, dates, watch CTA.

Dedicated page: `/youtube`

Potential organisation: Latest Videos, Most Popular, Accounts, Economics, Business Studies, Exam Preparation.

Only create categories supported by actual content.

---

## 21. YOUTUBE TECHNICAL DIRECTION

Where practical, design the system so that the latest videos can eventually be retrieved dynamically using the appropriate YouTube API.

```
YouTube Channel → YouTube API → Backend → Website
```

The website should not need manual code edits every time a new video is published if a reliable dynamic integration is implemented.

**API credentials and secrets must NEVER be exposed in client-side code.**

---

## 22. GALLERY

Potential categories: All, Classrooms, Students, Events, Achievements, Seminars, Celebrations. Only use categories that correspond to real content.

Do not create a boring wall of random images. Use masonry/grid layouts, strong image presentation, fullscreen viewer/lightbox, proper responsive behaviour, optimised images.

The gallery should communicate the real atmosphere of Commerce Insight.

---

## 23. ABOUT PAGE

```
About Commerce Insight → Our Story → Founder / Director → Mission → Vision →
Teaching Philosophy → Why Commerce Insight → Faculty → Achievements → CTA
```

The director's story should be given meaningful space. Do not make the About page a generic 300-word paragraph.

---

## 24. RESOURCES

Consider a resources section if Commerce Insight actually provides useful educational resources: notes, important updates, announcements, exam information, study material, educational articles.

This can later become useful for SEO and student engagement. Do not build complex functionality unless there is an actual business need.

---

## 25. CONTACT PAGE

Include, where applicable: address, phone, WhatsApp, email, opening hours, Google Maps, directions, enquiry form.

```
Have a Question? → Contact Information → Enquiry Form → Map → Directions
```

---

## 26. GOOGLE MAPS

The location should not simply be dumped at the bottom of a page. Create a useful location experience: map, address, opening/timing information, phone, WhatsApp, directions.

Ensure business information is consistent with the official Google Business Profile.

---

## 27. ENQUIRY / ADMISSION FLOW

Potential form fields: Name, Phone, Class, Course Interested In, Message. Only collect information actually needed.

```
Website → Enquiry API → Database → Admin Dashboard
```

Future possibilities:

```
New Enquiry → Notification → WhatsApp / Email → Follow-up
```

Do not build unnecessary automation unless required.

---

## 28. ADMIN DASHBOARD

Where practical, create an `/admin` system. Potential management areas: Dashboard, Courses, Faculty, Results, Toppers, Student Stories, Reviews, YouTube, Gallery, Resources, Announcements, Enquiries.

The goal is that the institute can eventually update content without asking the developer to edit source code.

Instead of: "Beta, ek topper add karna hai."

The institute should eventually be able to:

```
Admin → Add Topper → Upload Photo → Enter Result → Publish
```

---

## 29. DYNAMIC CONTENT ARCHITECTURE

```
                 ADMIN
                   │
        ┌──────────┼──────────┐
        ↓          ↓          ↓
     Courses    Results    Faculty
        │          │          │
        └──────────┼──────────┘
                   ↓
                DATABASE
                   │
                   ↓
          COMMERCE INSIGHT
              WEBSITE
```

External integrations:

```
Google Business Profile → Review Engine → Database
YouTube → YouTube API → Backend → Website
```

This architecture should be designed for scalability but not over-engineered.

---

## 30. MOBILE-FIRST REQUIREMENT

This website must be designed mobile-first. Do NOT build a desktop website and then squeeze it into mobile.

```
Instagram / WhatsApp / Google → Website → Course → Results → Reviews → Enquiry
```

Pay special attention to: navigation, typography, touch targets, course cards, forms, image sizes, CTA placement, sticky actions where useful, page speed, mobile spacing.

---

## 31. NAVIGATION

Possible structure: Home, About, Courses, Results, Faculty, Students, Media, Contact — with dropdowns/menus for secondary items where appropriate.

On mobile: clean hamburger navigation, clear hierarchy, prominent enquiry/contact action, easy WhatsApp/call access if appropriate.

Do not overload navigation with every page.

---

## 32. FOOTER

Potential areas: Commerce Insight + short description; Quick Links (Courses, Results, Faculty, Reviews, YouTube, Gallery, Contact); Courses; Contact (Address, Phone, WhatsApp, Email); Social (YouTube, Instagram, other verified platforms); Legal (Privacy Policy, Terms).

Only include platforms/accounts that actually exist.

---

## 33. SEO STRATEGY

SEO should be part of the architecture from the beginning. Implement proper: page titles, meta descriptions, Open Graph metadata, canonical URLs, semantic HTML, heading hierarchy, image alt text, sitemap, robots.txt, structured data where appropriate, internal linking, fast page loading.

Potential SEO landing pages: Homepage, Course pages, Results, Faculty, Location, Resources.

The exact SEO keywords should be researched based on the institute's actual city/location and offerings. Do not keyword-stuff.

---

## 34. PERFORMANCE

Priorities: optimised images, lazy loading where appropriate, efficient JavaScript, minimal unnecessary dependencies, good caching, responsive images, proper font loading, avoid huge client-side bundles, avoid unnecessary animations.

Target a polished, fast experience on mid-range mobile devices.

---

## 35. ACCESSIBILITY

Implement: good contrast, keyboard accessibility, visible focus states, semantic HTML, accessible forms, appropriate labels, alt text, reduced-motion support where appropriate, proper button/link semantics.

Do not sacrifice accessibility for aesthetics.

---

## 36. ANIMATION SYSTEM

Animations should be subtle and intentional.

- **Hero** — Soft entrance animation.
- **Cards** — Small hover elevation.
- **Statistics** — Count-up when entering viewport.
- **Images** — Soft reveal.
- **Page transitions** — Smooth but restrained.

> Motion should communicate hierarchy, not distract from content.

---

## 37. TYPOGRAPHY

Use a strong type hierarchy: Display, H1, H2, H3, Body, Small, Caption.

Typography should prioritize readability, professionalism, mobile usability, visual hierarchy. Do not use too many font families.

---

## 38. COMPONENT DESIGN SYSTEM

Create reusable components rather than designing each section independently:

Navbar, Footer, Hero, CTA, CourseCard, ResultCard, TopperCard, FacultyCard, ReviewCard, StudentStoryCard, VideoCard, GalleryCard, StatCounter, Badge, SectionHeader, FAQ, ContactForm, EnquiryForm, MapSection.

All components should follow a consistent design language.

---

## 39. RESPONSIVE DESIGN SYSTEM

Define breakpoints and behaviour intentionally. Do not merely rely on default framework behaviour.

For every major component, determine desktop, tablet, and mobile layout — particularly: Navbar, Hero, Course grids, Result grids, Topper cards, Faculty, Reviews, YouTube cards, Gallery, Forms, Footer.

---

## 40. TECHNICAL STACK

**Frontend:** Next.js + TypeScript — for SEO, routing, performance, scalability, modern React architecture.

**Styling:** Tailwind CSS with a properly defined design system.

**Backend:** Potentially Next.js server/API architecture, or a separate Node.js backend if the project complexity eventually justifies it. Do not create a separate backend merely for the sake of having one.

**Database:** Prefer PostgreSQL for structured dynamic content and future scalability.

---

## 41. SECURITY

Never: expose API keys, expose YouTube secrets, expose database credentials, expose Google credentials, trust client-side pricing/data blindly, store sensitive credentials in frontend code, commit secrets to Git, hard-code production secrets.

Use: environment variables, server-side integrations, proper validation, secure authentication for admin, authorization, protected API routes, secure file upload handling, rate limiting where necessary.

---

## 42. CONTENT INTEGRITY

**This is extremely important.**

If information is not known, do NOT invent it.

Never invent: student marks, number of students, years of experience, success rates, faculty qualifications, Google rating, review count, course offerings, achievements, testimonials, address, phone number, YouTube subscriber count.

Use placeholders such as `[CLIENT TO PROVIDE]` or clearly identify the required information.

The website must be impressive because of its design and architecture, not because of fabricated claims.

---

## 43. DATA / CMS THINKING

Whenever content is likely to change, design it as data: Courses, Results, Toppers, Faculty, Reviews, Videos, Gallery Images, Announcements, FAQs.

Do not hard-code every content item into components if a database/CMS model is appropriate.

---

## 44. FUTURE SCALABILITY

Possible future features: online admission, student login, student dashboard, study materials, test series, attendance, notifications, online payments, lead CRM, WhatsApp automation, AI student assistant, online classes, blog, advanced analytics.

**DO NOT build all of these now.** The current project should be architected so that sensible future expansion is possible without rebuilding the entire application.

---

## 45. CONVERSION STRATEGY

Every major page should have a logical next action.

- **Home:** Explore Courses / Talk to Us
- **Course:** Enquire About This Course
- **Results:** Explore Courses
- **YouTube:** Visit Channel
- **Reviews:** Enquire Now
- **Contact:** Submit Enquiry / Call / WhatsApp / Get Directions

Do not spam CTAs. Use them where they make contextual sense.

---

## 46. TRUST ARCHITECTURE

```
Brand → Faculty → Courses → Results → Toppers → Google Reviews →
Student Stories → Location → Contact → Enquiry
```

The user should gradually become more confident in the institute.

---

## 47. CONTENT HIERARCHY

1. What Commerce Insight is
2. Who it helps
3. Courses
4. Results
5. Faculty
6. Student achievements
7. Reviews
8. Educational content
9. Institute environment
10. Contact/enquiry

This is not a rigid rule, but use it when making UX decisions.

---

## 48. VISUAL STORYTELLING

Use real Commerce Insight assets wherever possible. Prioritize: real faculty photographs, real student photographs, real topper photographs, real classrooms, real events, real achievements, real YouTube thumbnails, real Google Reviews.

Do not substitute real evidence with generic stock imagery unless necessary.

---

## 49. PHOTOGRAPHY DIRECTION

When client photography is available: use high-quality crops, use consistent aspect ratios, maintain clean backgrounds, use natural lighting, avoid excessive filters, maintain professional presentation.

The website's visual quality will depend heavily on photography.

---

## 50. HOMEPAGE FINAL FLOW

```
NAVBAR → HERO → TRUST / CREDIBILITY → WHY COMMERCE INSIGHT → COURSES →
RESULTS / TOPPERS → FACULTY → GOOGLE REVIEWS → STUDENT STORIES →
YOUTUBE → GALLERY → LOCATION → FINAL CTA → FOOTER
```

This order can be adjusted after actual content discovery and UX testing.

---

## 51. OVERALL PRODUCT ARCHITECTURE

```
                         COMMERCE INSIGHT
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
       WEBSITE              ADMIN                EXTERNAL
          │                    │                    │
          │                    │             ┌──────┴──────┐
          │                    │             │             │
          ↓                    ↓             ↓             ↓
       Students             Content      Google        YouTube
       Parents              Management    Reviews        API
          │                    │             │             │
          └────────────────────┼─────────────┴─────────────┘
                               ↓
                            DATABASE
```

---

## 52. DEVELOPMENT PHILOSOPHY

**Do NOT start coding blindly.** The project must follow this sequence:

### PHASE 1 — DISCOVERY

Collect: logo, brand assets, institute story, courses, faculty, results, toppers, student stories, testimonials, Google Business Profile information, address, phone, WhatsApp, YouTube, social media, FAQs, admission process, achievements, USP, target audience, available photography, available videos.

### PHASE 2 — WEBSITE STRATEGY

Define: information architecture, sitemap, user journeys, conversion strategy, content hierarchy, SEO strategy, dynamic content architecture.

### PHASE 3 — DESIGN SYSTEM

Define: brand colours, typography, spacing, grid, buttons, cards, forms, navigation, footer, badges, icons, shadows, border radii, responsive behaviour, motion principles.

The brand must remain primarily **blue + white**, with controlled orange accents derived from the official logo.

### PHASE 4 — UI/UX

Design every major page before blindly generating the entire application: Home, About, Courses, Course detail, Results, Toppers, Faculty, Students, Reviews, YouTube, Gallery, Resources, Contact, Enquiry, Admin.

### PHASE 5 — TECHNICAL ARCHITECTURE

Define: frontend, backend, database, admin, authentication, API architecture, Review Engine integration, YouTube integration, maps, image storage, analytics, lead system, SEO infrastructure.

### PHASE 6 — IMPLEMENTATION

Only after the above decisions are sufficiently defined should implementation begin. Build clean, maintainable, production-quality code.

### PHASE 7 — AUDIT

- **Functional audit** — Does everything work?
- **UX audit** — Is the experience intuitive?
- **UI audit** — Does every page feel consistent and premium?
- **Mobile audit** — Does it work properly on phones?
- **Performance audit** — Is it fast?
- **SEO audit** — Can search engines understand it?
- **Accessibility audit** — Can users navigate it properly?
- **Security audit** — Are secrets, APIs, authentication and user input protected?
- **Content audit** — Is any information fabricated, misleading, outdated, or inconsistent?

---

## 53. QUALITY BAR

The final website must NOT feel like "An AI generated website."

It should feel like "A professionally designed digital product made specifically for Commerce Insight."

Every major design decision should answer: **Why is this here?**

Every technical decision should answer: **Why is this architecture appropriate?**

Every feature should answer: **What value does this provide to the institute, student, parent, or administrator?**

If something exists only because it looks cool, remove it.

---

## 54. IMPORTANT IMPLEMENTATION RULE

Do not blindly follow this blueprint where real client information contradicts it.

This document defines vision, quality standard, architecture, design direction, functionality, and strategic goals. **Actual business facts supplied by Commerce Insight must override assumptions.**

For missing information:

1. Identify it.
2. Mark it as client input required.
3. Do not fabricate it.
4. Continue designing around the missing information where possible.

---

## 55. FINAL DESIGN NORTH STAR

> **"Commerce Insight is a serious, modern, successful and trustworthy place to study Commerce — and this website proves it."**

The website should be:

**Premium without being flashy. Modern without being gimmicky. Professional without being boring. Informative without being overwhelming. Conversion-focused without feeling salesy. Technically sophisticated without becoming unnecessarily complex. Visually distinctive while remaining faithful to the Commerce Insight logo.**

The final visual identity should unmistakably belong to Commerce Insight:

> **DEEP BLUE + WHITE + CONTROLLED ORANGE ACCENTS**

with strong typography, excellent spacing, authentic photography, real student success, real reviews, real educational content, and a clear path toward enquiry.

---

## 56. YOUR ROLE AS CLAUDE

For this project, do not behave like a code autocomplete tool.

Act as a multidisciplinary senior team consisting of: Creative Director, Brand Designer, UX Designer, Product Strategist, Conversion Specialist, SEO Specialist, Technical Architect, Senior Frontend Engineer, Senior Backend Engineer, Security Engineer, QA Engineer.

Think critically.

- If a proposed feature is unnecessary, say so.
- If the information architecture can be improved, explain why.
- If a design decision would hurt usability, challenge it.
- If content is missing, identify it.
- If a technical implementation creates unnecessary complexity, simplify it.

Do not blindly obey weak design decisions simply because they were mentioned in the blueprint.

The goal is the **best possible Commerce Insight website**, not the maximum number of features.

---

## 57. FIRST TASK

DO NOT immediately generate the complete application.

First, internalize this blueprint and produce a **Commerce Insight Website Master Plan** containing:

1. Final recommended sitemap
2. Complete page inventory
3. Homepage section-by-section architecture
4. Page-by-page UX strategy
5. User journeys for students
6. User journeys for parents
7. Conversion strategy
8. Brand/design direction based on the supplied logo
9. Complete design system proposal
10. Component architecture
11. Dynamic content/data model proposal
12. Admin dashboard architecture
13. Google Review Engine integration architecture
14. YouTube integration architecture
15. Google Maps/location architecture
16. Enquiry/lead architecture
17. SEO architecture
18. Performance strategy
19. Security strategy
20. Accessibility strategy
21. Responsive/mobile strategy
22. Required client information/assets
23. Recommended development phases
24. Risks and potential issues
25. Final implementation roadmap

Do not skip any of these.

After producing the Master Plan, wait for approval before beginning the full implementation unless explicitly instructed otherwise.

> **Status:** Delivered — see `docs/MASTER-PLAN.html`.

---

## FINAL DIRECTIVE

This is not a template website project. This is a **flagship Commerce Insight digital platform**.

Build it with the mindset that:

- Students will use it to decide whether to study at Commerce Insight.
- Parents will use it to judge the institute's credibility.
- The institute will use it as its primary digital presence.
- Google Reviews will provide real external social proof.
- YouTube will extend the institute's educational presence.
- Results and toppers will demonstrate actual performance.
- The enquiry system will turn visitors into potential students.
- The admin system will eventually allow the institute to manage its own content.
- The website may become a showcase project for TradyPerch.
- The architecture should allow sensible future expansion.

Most importantly:

**Do not build something that merely looks good.**

Build something that **works, communicates, converts, scales, and represents Commerce Insight professionally.**

The standard is not: "Is this a good AI-generated coaching website?"

The standard is:

> **"If Commerce Insight becomes one of the most respected Commerce coaching brands in its market, would this website feel worthy of that brand?"**

That is the bar. Build toward that.
