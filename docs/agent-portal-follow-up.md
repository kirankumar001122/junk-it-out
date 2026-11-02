# Agent portal follow-up decisions

## Pickup details before acceptance

Open-order details are limited to available agents with no active assignment and
the same payment and service-area eligibility checks enforced by acceptance.
Before acceptance, the response exposes the order number, service area, and
declared categories/estimated weights, but not customer identity, phone, street
address, coordinates, pickup instructions, or actual weights. The acceptance
handler remains the authoritative state-changing check.

## Location sharing

The portal requests browser location only after the agent explicitly enables
sharing. It ignores stale or invalid readings and does not send coordinates
when browser geolocation is unsupported or permission/location lookup fails.
Device permission and location accuracy remain browser/OS controlled.

## Weight and scale-photo evidence

The completion handler uses submitted per-item weights and stored rates to
calculate order totals, payment direction, settlement amount, and invoice data.
This change intentionally adds no physical weight limits; operations/product
must define any limits and exception process before they are enforced.

The portal does not implement scale-photo capture or upload. A stock image is
not evidence and is no longer written as a default photo URL. An absent photo
is stored as `null`. Product/operations must decide whether completion requires
an uploaded photo, what storage/retention rules apply, and whether an upload
failure blocks completion before a verified evidence workflow is introduced.
