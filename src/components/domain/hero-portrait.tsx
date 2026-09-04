import Image from 'next/image';
import type { PublicFaculty } from '@/lib/public-data';

/**
 * The homepage hero's portrait.
 *
 * =============================================================================
 * WHY A PHOTOGRAPH REPLACED THE PROGRAMME PANEL
 * =============================================================================
 * Phase 15 gave the hero a second column because the largest type on the site
 * had nothing to sit against, and filled it with the course list. That worked
 * as ballast and did nothing else: the same five programmes are in the header,
 * in the footer, and on /courses one click away, so the most valuable space on
 * the busiest page was spent repeating navigation.
 *
 * The owner asked for the teacher instead, and that is the right trade for an
 * institute this size. A parent choosing a coaching class is choosing a person;
 * the programme list answers a question they ask second.
 *
 * =============================================================================
 * THE PHOTOGRAPH IS A FACULTY RECORD. THERE IS NO OTHER KIND OF PORTRAIT HERE.
 * =============================================================================
 * `getHeroPortrait()` reads the highest-priority published teacher who has an
 * uploaded photograph — see the argument on that function. Nothing in this
 * component knows a file path, so the institute changes the face on its own
 * homepage by uploading a photograph in the admin, exactly as it changes the
 * one on /faculty. The hero drops the column entirely when there is no such
 * record, which is the rule every band on that page already follows.
 *
 * =============================================================================
 * WHY THE NAME IS PART OF THE PLATE AND NOT A CAPTION UNDER IT
 * =============================================================================
 * A light label bar below a rounded photograph makes this two objects — a
 * picture, and a card about the picture — which is what a profile widget looks
 * like. One frame, with the photograph running to its edges and a navy foot
 * carrying the name, reads as a single portrait plate. It is also the one place
 * on this light page where the brand navy appears at full strength, opposite a
 * headline that had none.
 *
 * THE FOOT IS OPAQUE, NOT A SCRIM OVER THE IMAGE. A gradient over the
 * photograph is the prettier version of this and its contrast depends on what
 * is underneath: white over a 25%-transparent navy on a bright photograph
 * measures about 3.4:1, and the photograph is chosen by a teacher, months from
 * now, with nobody measuring. On the solid band the numbers are fixed and
 * known — white 13.4:1, the orange 5.9:1, the muted blue 10.6:1 — whatever
 * they upload.
 *
 * A FIXED BOX WITH `object-cover`, for the reason the faculty card gives for
 * its square: it crops rather than stretches, the layout is known before any
 * byte of the photograph arrives, and nothing shifts when it lands.
 *
 * The box is 4:5 while the hero is stacked, because a phone has the height to
 * spend and a portrait wants it. Above `lg` it shallows to 9:10 — measured,
 * the text column beside it is about 330px tall at 1440px, and a full 4:5
 * plate came out at 643px, which is not a split so much as a photograph with
 * some words next to it. 9:10 lands at ~580px: still unmistakably the larger
 * element, which it should be, without the headline looking like a caption.
 */
export function HeroPortrait({ member }: { member: PublicFaculty }) {
  // `getHeroPortrait` never returns a record without one. Checked anyway, so
  // this component cannot be the thing that hands `next/image` an empty src.
  if (!member.photoUrl) return null;

  return (
    <figure className="mx-auto w-full max-w-[340px] sm:max-w-[400px] lg:ml-auto lg:mr-0 lg:max-w-[420px]">
      <div className="overflow-hidden rounded-lg border border-rule-strong bg-surface-2 shadow-e3">
        <div className="relative aspect-[4/5] w-full lg:aspect-[9/10]">
          <Image
            src={member.photoUrl}
            /*
              Named, not decorative — the same wording the faculty card uses,
              for the same reason. Somebody listening to this page is being
              introduced to a person.
            */
            alt={`${member.name}, ${member.designation}`}
            fill
            /*
              The right-hand column is 0.85fr of a 1200px container above `lg`
              and the figure caps at 420px inside it; below `lg` it is 400px,
              then the viewport less the gutters. Declared so the optimiser is
              never asked for a 1920px render of a 420px slot.
            */
            sizes="(min-width: 1024px) 420px, (min-width: 640px) 400px, 90vw"
            /*
              `object-top`: a head is at the top of a portrait, so a crop that
              has to lose something should lose the floor.
            */
            className="object-cover object-top"
            /*
              Above the fold on the site's most-visited page and the largest
              element in the viewport — the LCP candidate, so it is not lazy.

              It is the SECOND eager image on this route, after the header logo,
              and `scripts/verify-budget.mjs` had to be told so: its allowance
              is now two on "/" and one everywhere else. The gallery strip
              further down stays lazy and outside the request count.
            */
            priority
          />
        </div>

        <figcaption className="border-t border-navy-700 bg-band px-5 py-4 sm:px-6 sm:py-5">
          <p className="font-display text-[19px] font-semibold leading-tight text-band-text sm:text-[21px]">
            {member.name}
          </p>
          <p className="mt-1 text-small font-medium text-accent">
            {member.designation}
          </p>
          {member.subject ? (
            <p className="mt-0.5 text-small text-band-muted">{member.subject}</p>
          ) : null}
        </figcaption>
      </div>
    </figure>
  );
}
