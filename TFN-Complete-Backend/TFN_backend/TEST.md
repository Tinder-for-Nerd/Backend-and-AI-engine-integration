# ProMatch API — Complete Endpoint Test Reference

**Base URL:** `http://localhost:8002`  
**OpenAPI Docs:** `http://localhost:8002/docs`  
**Test Client UI:** `http://localhost:8080/test_client.html`

---

## 0. Setup — Get JWTs

All protected endpoints require `Authorization: Bearer <JWT>`.  
Get tokens by signing up via Supabase Auth.

### Sign up User A
```bash
curl -s -X POST \
  "https://aihnssrknqaiadqprcza.supabase.co/auth/v1/signup" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpaG5zc3JrbnFhaWFkcXByY3phIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzNDM2NTUsImV4cCI6MjA5MTkxOTY1NX0.3D95dZG-SeZb2caj2frH-kpxjWffbRqBj37ZgBhfO4c" \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@promatch.test","password":"Test1234!"}'
```
Copy `access_token` → set as `TOKEN_A`.

### Sign up User B
```bash
curl -s -X POST \
  "https://aihnssrknqaiadqprcza.supabase.co/auth/v1/signup" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpaG5zc3JrbnFhaWFkcXByY3phIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzNDM2NTUsImV4cCI6MjA5MTkxOTY1NX0.3D95dZG-SeZb2caj2frH-kpxjWffbRqBj37ZgBhfO4c" \
  -H "Content-Type: application/json" \
  -d '{"email":"bob@promatch.test","password":"Test1234!"}'
```
Copy `access_token` → set as `TOKEN_B`.

### Set shell variables (run once per terminal session)
```bash
export API="http://localhost:8002"
export TOKEN_A="<paste token A here>"
export TOKEN_B="<paste token B here>"
# Get profile IDs after loading /me (used later)
export ID_A=""   # fill after step 1.1
export ID_B=""   # fill after step 1.2
export MATCH_ID="" # fill after mutual like test
```

> **Windows CMD:** use `set TOKEN_A=...` instead of `export`.

---

## 1. Health

### 1.1 Liveness
```bash
curl -s $API/healthz
```
**Expected:** `{"status":"ok"}`

### 1.2 Readiness (DB + Redis)
```bash
curl -s $API/readyz
```
**Expected:** `{"status":"ok","checks":{"db":"ok","redis":"ok"}}`

### 1.3 Version
```bash
curl -s $API/version
```
**Expected:** `{"git_sha":"dev"}`

### 1.4 No-auth guard (should 401)
```bash
curl -s $API/api/v1/me
```
**Expected:** `401` `{"code":"missing_token","message":"Authorization header required"}`

---

## 2. My Profile (Users)

### 2.1 Get my profile
```bash
curl -s -H "Authorization: Bearer $TOKEN_A" $API/api/v1/me
```
**Expected:** `200` — profile object.  
→ Copy `id` field → save as `ID_A`.

### 2.2 Update my profile
```bash
curl -s -X PATCH \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  $API/api/v1/me \
  -d '{
    "display_name": "Alice Researcher",
    "headline": "ML engineer | open to collaboration",
    "bio": "Working on NLP for low-resource languages. Looking for research partners.",
    "role": "researcher",
    "seniority": "mid",
    "location_city": "London",
    "location_country": "UK",
    "visibility": "public",
    "looking_for": ["collaboration", "mentorship_mentor", "networking"]
  }'
```
**Expected:** `200` — updated profile object with new fields.

### 2.3 Update User B profile
```bash
curl -s -X PATCH \
  -H "Authorization: Bearer $TOKEN_B" \
  -H "Content-Type: application/json" \
  $API/api/v1/me \
  -d '{
    "display_name": "Bob Builder",
    "headline": "Distributed systems @ startup",
    "role": "founder",
    "seniority": "senior",
    "location_city": "London",
    "looking_for": ["collaboration", "cofounder", "networking"]
  }'
```
→ Copy `id` → save as `ID_B`.

### 2.4 Bad token (should 401)
```bash
curl -s -H "Authorization: Bearer thisisnotavalidjwt" $API/api/v1/me
```
**Expected:** `401` `{"code":"token_invalid:...","message":"Invalid or expired token"}`

---

## 3. Profiles (Public)

### 3.1 View profile by username
```bash
# Replace alice_researcher with actual username from step 2.1
curl -s -H "Authorization: Bearer $TOKEN_A" \
  $API/api/v1/profiles/alice_researcher
```
**Expected:** `200` — profile object.

### 3.2 Get interests lookup table
```bash
curl -s -H "Authorization: Bearer $TOKEN_A" $API/api/v1/interests
```
**Expected:** `200` — array of 20 interest objects (slug, name, category).  
→ Copy a few `id` values for step 3.4.

### 3.3 Set my interests
```bash
# Replace <interest-uuid-1> etc with real UUIDs from step 3.2
curl -s -X PUT \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  $API/api/v1/me/interests \
  -d '["<interest-uuid-1>", "<interest-uuid-2>"]'
```
**Expected:** `200` `{"ok":true}`

### 3.4 Add a project
```bash
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  $API/api/v1/me/projects \
  -d '{
    "title": "LowRes NLP Toolkit",
    "description": "Open-source toolkit for NLP in under-resourced languages.",
    "url": "https://example.com/lowresnlp",
    "repo_url": "https://github.com/alice/lowresnlp",
    "tags": ["nlp","python","research"],
    "is_seeking_collab": true
  }'
```
**Expected:** `201` — project object with `id`.  
→ Save as `PROJECT_ID`.

### 3.5 List projects for a profile
```bash
curl -s -H "Authorization: Bearer $TOKEN_A" \
  $API/api/v1/profiles/$ID_A/projects
```
**Expected:** `200` — array containing the project from 3.4.

### 3.6 Update a project
```bash
curl -s -X PATCH \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  $API/api/v1/me/projects/$PROJECT_ID \
  -d '{
    "title": "LowRes NLP Toolkit v2",
    "description": "Updated description.",
    "tags": ["nlp","python","research","multilingual"],
    "is_seeking_collab": true
  }'
```
**Expected:** `200` — project with updated title.

### 3.7 Add a profile link
```bash
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  $API/api/v1/me/links \
  -d '{
    "kind": "github",
    "url": "https://github.com/alice",
    "display_label": "GitHub"
  }'
```
**Expected:** `201` — link object with `id` and `is_verified: false`.  
→ Save as `LINK_ID`.

### 3.8 List links for a profile
```bash
curl -s -H "Authorization: Bearer $TOKEN_A" \
  $API/api/v1/profiles/$ID_A/links
```
**Expected:** `200` — array with the GitHub link.

### 3.9 List badges
```bash
curl -s -H "Authorization: Bearer $TOKEN_A" \
  $API/api/v1/profiles/$ID_A/badges
```
**Expected:** `200` — empty array (no badges yet, verification is async).

### 3.10 Delete a project
```bash
curl -s -X DELETE \
  -H "Authorization: Bearer $TOKEN_A" \
  $API/api/v1/me/projects/$PROJECT_ID
```
**Expected:** `200` `{"ok":true}`

### 3.11 Delete a link
```bash
curl -s -X DELETE \
  -H "Authorization: Bearer $TOKEN_A" \
  $API/api/v1/me/links/$LINK_ID
```
**Expected:** `200` `{"ok":true}`

---

## 4. Discovery

### 4.1 Get discovery feed (no filter)
```bash
curl -s -H "Authorization: Bearer $TOKEN_A" \
  "$API/api/v1/discovery/feed"
```
**Expected:** `200` — `{"items":[...],"next_cursor":null,"has_more":false}`.  
Items include profiles except own and already-liked/passed.

### 4.2 Get discovery feed with intent filter
```bash
curl -s -H "Authorization: Bearer $TOKEN_A" \
  "$API/api/v1/discovery/feed?looking_for=collaboration"
```
**Expected:** `200` — only profiles with `collaboration` in `looking_for`.

### 4.3 Get discovery feed with location filter
```bash
curl -s -H "Authorization: Bearer $TOKEN_A" \
  "$API/api/v1/discovery/feed?location=London"
```
**Expected:** `200` — profiles in London only.

### 4.4 Submit feedback
```bash
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  $API/api/v1/discovery/feedback \
  -d '{
    "target_profile_id": "'$ID_B'",
    "event_type": "shown",
    "value": {"dwell_ms": 3200}
  }'
```
**Expected:** `200` `{"ok":true}`

---

## 5. Likes & Passes

### 5.1 A likes B
```bash
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  $API/api/v1/likes \
  -d '{
    "likee_id": "'$ID_B'",
    "intents": ["collaboration"],
    "note": "Loved your distributed systems work!"
  }'
```
**Expected:** `201` — `{"like":{...},"match":null}` (no match yet, waiting for B).

### 5.2 Duplicate like (should 409)
```bash
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  $API/api/v1/likes \
  -d '{"likee_id": "'$ID_B'", "intents": ["collaboration"]}'
```
**Expected:** `409` `{"code":"already_liked","message":"You already liked this user"}`

### 5.3 Self-like (should 400)
```bash
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  $API/api/v1/likes \
  -d '{"likee_id": "'$ID_A'", "intents": ["networking"]}'
```
**Expected:** `400` `{"code":"self_like",...}`

### 5.4 B likes A → creates match
```bash
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN_B" \
  -H "Content-Type: application/json" \
  $API/api/v1/likes \
  -d '{
    "likee_id": "'$ID_A'",
    "intents": ["collaboration", "networking"]
  }'
```
**Expected:** `201` — `{"like":{...},"match":{"id":"...","shared_intents":["collaboration"],...}}`  
→ Copy `match.id` → save as `MATCH_ID`.

### 5.5 Get received likes
```bash
curl -s -H "Authorization: Bearer $TOKEN_A" \
  $API/api/v1/likes/received
```
**Expected:** `200` — array with B's like (if match not yet created, or even after).

### 5.6 Pass on a user
```bash
# Need a third user ID for this. Use any UUID of another profile.
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  $API/api/v1/passes \
  -d '{"likee_id": "<some-other-profile-id>"}'
```
**Expected:** `201` `{"ok":true}`

---

## 6. Matches

### 6.1 List my matches
```bash
curl -s -H "Authorization: Bearer $TOKEN_A" $API/api/v1/matches
```
**Expected:** `200` — array containing the match from step 5.4.

### 6.2 Get a specific match
```bash
curl -s -H "Authorization: Bearer $TOKEN_A" \
  $API/api/v1/matches/$MATCH_ID
```
**Expected:** `200` — match object with `status: "active"`, `shared_intents: ["collaboration"]`.

### 6.3 Non-participant access (should 403)
```bash
# Sign up a third user and try to access A-B match
# Expected: 403 {"code":"not_participant",...}
```

### 6.4 Close a match
```bash
# A closes (A is profile_a since order_pair puts smaller UUID first)
curl -s -X PATCH \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  $API/api/v1/matches/$MATCH_ID \
  -d '{"status": "closed_by_a"}'
```
**Expected:** `200` — match with `status: "closed_by_a"`.

> **Note:** Once closed, messaging is blocked. Re-create a match if needed for further tests.

---

## 7. Messages

> Requires an **active** match. Re-run step 5 with fresh users if match was closed.

### 7.1 Send a message (A → B)
```bash
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  $API/api/v1/matches/$MATCH_ID/messages \
  -d '{"content": "Hey! Saw you work on distributed systems. Would love to connect.", "kind": "text"}'
```
**Expected:** `201` — message object with `id`, `sender_id`, `created_at`.  
→ Save message `id` as `MSG_ID`.

### 7.2 Send a reply (B → A)
```bash
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN_B" \
  -H "Content-Type: application/json" \
  $API/api/v1/matches/$MATCH_ID/messages \
  -d '{"content": "Thanks! Always happy to chat about distributed consensus. What are you working on?"}'
```
**Expected:** `201`

### 7.3 List messages
```bash
curl -s -H "Authorization: Bearer $TOKEN_A" \
  "$API/api/v1/matches/$MATCH_ID/messages?limit=20"
```
**Expected:** `200` — array of 2 messages, newest first.

### 7.4 List messages with cursor (pagination)
```bash
# Use created_at of oldest message as cursor
curl -s -H "Authorization: Bearer $TOKEN_A" \
  "$API/api/v1/matches/$MATCH_ID/messages?before=2026-01-01T00:00:00Z"
```
**Expected:** `200` — empty array (no messages before that date).

### 7.5 Edit a message (within 15 min window)
```bash
curl -s -X PATCH \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  $API/api/v1/messages/$MSG_ID \
  -d '{"content": "Hey! Saw you work on distributed systems. Amazing stuff — would love to connect."}'
```
**Expected:** `200` — message with updated `content` and non-null `edited_at`.

### 7.6 Edit someone else's message (should 403)
```bash
curl -s -X PATCH \
  -H "Authorization: Bearer $TOKEN_B" \
  -H "Content-Type: application/json" \
  $API/api/v1/messages/$MSG_ID \
  -d '{"content": "Hacked"}'
```
**Expected:** `403` `{"code":"not_sender",...}`

### 7.7 Mark messages as read
```bash
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN_B" \
  -H "Content-Type: application/json" \
  $API/api/v1/matches/$MATCH_ID/read \
  -d '{"message_ids": ["'$MSG_ID'"]}'
```
**Expected:** `200` `{"ok":true}`

### 7.8 Delete a message (soft delete)
```bash
curl -s -X DELETE \
  -H "Authorization: Bearer $TOKEN_A" \
  $API/api/v1/messages/$MSG_ID
```
**Expected:** `200` `{"ok":true}`. Content set to null, `is_deleted: true`.

---

## 8. Availability

### 8.1 Create a recurring weekly slot
```bash
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  $API/api/v1/me/availability \
  -d '{
    "starts_at": "2026-04-21T10:00:00Z",
    "ends_at":   "2026-04-21T11:00:00Z",
    "is_recurring": true,
    "rrule": "FREQ=WEEKLY;BYDAY=MO",
    "is_available": true
  }'
```
**Expected:** `201` — slot object with `id`.  
→ Save as `SLOT_ID`.

### 8.2 Create a one-time slot
```bash
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  $API/api/v1/me/availability \
  -d '{
    "starts_at": "2026-04-25T14:00:00Z",
    "ends_at":   "2026-04-25T15:00:00Z",
    "is_recurring": false,
    "is_available": true
  }'
```
**Expected:** `201`

### 8.3 List my availability slots
```bash
curl -s -H "Authorization: Bearer $TOKEN_A" $API/api/v1/me/availability
```
**Expected:** `200` — array of 2 slots.

### 8.4 View expanded availability for a profile (next 14 days)
```bash
curl -s -H "Authorization: Bearer $TOKEN_B" \
  $API/api/v1/profiles/$ID_A/availability
```
**Expected:** `200` — array of concrete `{"starts_at":"...","ends_at":"..."}` windows.

### 8.5 Update a slot
```bash
curl -s -X PATCH \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  $API/api/v1/me/availability/$SLOT_ID \
  -d '{
    "starts_at": "2026-04-21T09:00:00Z",
    "ends_at":   "2026-04-21T10:00:00Z",
    "is_recurring": true,
    "rrule": "FREQ=WEEKLY;BYDAY=MO",
    "is_available": true
  }'
```
**Expected:** `200` — updated slot.

### 8.6 Delete a slot
```bash
curl -s -X DELETE \
  -H "Authorization: Bearer $TOKEN_A" \
  $API/api/v1/me/availability/$SLOT_ID
```
**Expected:** `200` `{"ok":true}`

---

## 9. Bookings

### 9.1 B books a slot with A (guest = B, host = A)
```bash
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN_B" \
  -H "Content-Type: application/json" \
  $API/api/v1/bookings \
  -d '{
    "host_id": "'$ID_A'",
    "starts_at": "2026-04-28T10:00:00Z",
    "ends_at":   "2026-04-28T11:00:00Z",
    "kind": "coffee",
    "notes": "Would love to discuss your NLP research over a virtual coffee."
  }'
```
**Expected:** `201` — booking with `status: "pending"`.  
→ Save `id` as `BOOKING_ID`.

### 9.2 Self-booking (should 400)
```bash
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  $API/api/v1/bookings \
  -d '{"host_id":"'$ID_A'","starts_at":"2026-04-28T10:00:00Z","ends_at":"2026-04-28T11:00:00Z","kind":"coffee"}'
```
**Expected:** `400` `{"code":"self_booking",...}`

### 9.3 List my bookings
```bash
curl -s -H "Authorization: Bearer $TOKEN_A" $API/api/v1/bookings
```
**Expected:** `200` — array containing the pending booking.

### 9.4 Get a specific booking
```bash
curl -s -H "Authorization: Bearer $TOKEN_A" \
  $API/api/v1/bookings/$BOOKING_ID
```
**Expected:** `200` — booking object.

### 9.5 A (host) confirms the booking
```bash
curl -s -X PATCH \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  $API/api/v1/bookings/$BOOKING_ID \
  -d '{"status": "confirmed"}'
```
**Expected:** `200` — booking with `status: "confirmed"` and a `meeting_url` (Jitsi link).

### 9.6 A (host) marks as completed
```bash
curl -s -X PATCH \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  $API/api/v1/bookings/$BOOKING_ID \
  -d '{"status": "completed"}'
```
**Expected:** `200` — `status: "completed"`.

### 9.7 Invalid transition (should 400)
```bash
# Guest trying to confirm (only host can confirm)
curl -s -X PATCH \
  -H "Authorization: Bearer $TOKEN_B" \
  -H "Content-Type: application/json" \
  $API/api/v1/bookings/$BOOKING_ID \
  -d '{"status": "confirmed"}'
```
**Expected:** `400` `{"code":"invalid_transition",...}`

---

## 10. Events

### 10.1 Create an event (goes to pending_review)
```bash
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  $API/api/v1/events \
  -d '{
    "title": "NLP Research Reading Group",
    "description": "Weekly paper reading session for NLP enthusiasts.",
    "host_type": "user",
    "kind": "paper_reading",
    "mode": "online",
    "meeting_url": "https://meet.jit.si/nlp-reading-group",
    "starts_at": "2026-05-01T18:00:00Z",
    "ends_at":   "2026-05-01T20:00:00Z",
    "capacity": 20,
    "tags": ["nlp","research","reading-group"]
  }'
```
**Expected:** `201` — event with `approval_status: "pending_review"`.  
→ Save `id` as `EVENT_ID`.

### 10.2 List public events (approved only — empty until admin approves)
```bash
curl -s -H "Authorization: Bearer $TOKEN_A" $API/api/v1/events
```
**Expected:** `200` — empty array (event is pending review).

### 10.3 Get event by ID (host can see their own pending)
```bash
curl -s -H "Authorization: Bearer $TOKEN_A" \
  $API/api/v1/events/$EVENT_ID
```
**Expected:** `200` — event object.

### 10.4 Update event
```bash
curl -s -X PATCH \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  $API/api/v1/events/$EVENT_ID \
  -d '{
    "title": "NLP Research Reading Group — Season 2",
    "description": "Weekly paper reading session for NLP enthusiasts.",
    "host_type": "user",
    "kind": "paper_reading",
    "mode": "online",
    "starts_at": "2026-05-01T18:00:00Z",
    "ends_at":   "2026-05-01T20:00:00Z",
    "capacity": 30
  }'
```
**Expected:** `200` — updated event.

### 10.5 RSVP to event (requires approved event — do step 11.1 first)
```bash
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN_B" \
  $API/api/v1/events/$EVENT_ID/rsvp
```
**Expected:** `201` — attendee object. (Requires event to be approved first — see §11.1)

### 10.6 List attendees (host or RSVPd user only)
```bash
curl -s -H "Authorization: Bearer $TOKEN_A" \
  $API/api/v1/events/$EVENT_ID/attendees
```
**Expected:** `200` — array of attendees.

### 10.7 Cancel RSVP
```bash
curl -s -X DELETE \
  -H "Authorization: Bearer $TOKEN_B" \
  $API/api/v1/events/$EVENT_ID/rsvp
```
**Expected:** `200` `{"ok":true}`

### 10.8 Cancel event (host only)
```bash
curl -s -X DELETE \
  -H "Authorization: Bearer $TOKEN_A" \
  $API/api/v1/events/$EVENT_ID
```
**Expected:** `200` `{"ok":true}`

---

## 11. Admin

> Requires admin JWT. Promote a user in Supabase: Dashboard → Authentication → Users → Edit → set `app_metadata` to `{"role":"admin"}`. Re-login to get a fresh token with admin claim.

```bash
export ADMIN_TOKEN="<admin JWT here>"
```

### 11.1 Approve an event
```bash
curl -s -X POST \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  $API/api/v1/admin/events/$EVENT_ID/review \
  -d '{"approve": true}'
```
**Expected:** `200` — event with `approval_status: "approved"`.  
Event now visible in public listing (step 10.2).

### 11.2 Reject an event
```bash
curl -s -X POST \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  $API/api/v1/admin/events/$EVENT_ID/review \
  -d '{"approve": false, "review_notes": "Content policy violation"}'
```
**Expected:** `200` — event with `approval_status: "rejected"`.

### 11.3 List all reports
```bash
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$API/api/v1/admin/reports"
```
**Expected:** `200` — all reports array.

### 11.4 Filter reports by status
```bash
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$API/api/v1/admin/reports?status=open"
```
**Expected:** `200` — only `open` reports.

### 11.5 Update a report
```bash
# Replace REPORT_ID with an actual report ID from step 12.1
curl -s -X PATCH \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  $API/api/v1/admin/reports/$REPORT_ID \
  -d '{"status": "resolved", "resolution_notes": "User warned. No further action."}'
```
**Expected:** `200` — report with updated status.

### 11.6 Suspend a profile
```bash
curl -s -X POST \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  $API/api/v1/admin/profiles/$ID_B/suspend \
  -d '{"reason": "Repeated spam reports"}'
```
**Expected:** `200` `{"ok":true}`. Profile `is_active` → `false`.

### 11.7 Non-admin access (should 403)
```bash
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  $API/api/v1/admin/profiles/$ID_B/suspend \
  -d '{"reason":"test"}'
```
**Expected:** `403` `{"code":"not_admin",...}`

---

## 12. Moderation

### 12.1 File a report
```bash
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  $API/api/v1/reports \
  -d '{
    "reported_profile_id": "'$ID_B'",
    "reason": "spam",
    "details": "Keeps sending unsolicited messages."
  }'
```
**Expected:** `201` — report object with `status: "open"`.  
→ Save `id` as `REPORT_ID`.

### 12.2 Block a user
```bash
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  $API/api/v1/blocks \
  -d '{"blocked_id": "'$ID_B'"}'
```
**Expected:** `201` — block object.  
Side effect: any active match between A and B is archived automatically (DB trigger).

### 12.3 List my blocks
```bash
curl -s -H "Authorization: Bearer $TOKEN_A" $API/api/v1/blocks
```
**Expected:** `200` — array with the block from 12.2.

### 12.4 Verify match archived after block
```bash
curl -s -H "Authorization: Bearer $TOKEN_A" \
  $API/api/v1/matches/$MATCH_ID
```
**Expected:** match `status` is now `"archived"`.

### 12.5 Self-block (should 400)
```bash
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  $API/api/v1/blocks \
  -d '{"blocked_id": "'$ID_A'"}'
```
**Expected:** `400` `{"code":"self_block",...}`

### 12.6 Unblock a user
```bash
curl -s -X DELETE \
  -H "Authorization: Bearer $TOKEN_A" \
  $API/api/v1/blocks/$ID_B
```
**Expected:** `200` `{"ok":true}`

---

## 13. Notifications

> Notifications are auto-created by the DB trigger (new_match) and by service layer (likes, bookings).

### 13.1 List notifications
```bash
curl -s -H "Authorization: Bearer $TOKEN_A" $API/api/v1/notifications
```
**Expected:** `200` — array of notifications (e.g. `new_match`, `new_like`).  
→ Copy a notification `id` as `NOTIF_ID`.

### 13.2 List unread only
```bash
curl -s -H "Authorization: Bearer $TOKEN_A" \
  "$API/api/v1/notifications?unread_only=true"
```
**Expected:** `200` — only unread notifications.

### 13.3 Mark specific notifications as read
```bash
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  $API/api/v1/notifications/read \
  -d '{"notification_ids": ["'$NOTIF_ID'"]}'
```
**Expected:** `200` `{"ok":true}`

### 13.4 Mark all notifications as read
```bash
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN_A" \
  $API/api/v1/notifications/read_all
```
**Expected:** `200` `{"ok":true}`

### 13.5 Verify unread count is now 0
```bash
curl -s -H "Authorization: Bearer $TOKEN_A" \
  "$API/api/v1/notifications?unread_only=true"
```
**Expected:** `200` — empty array `[]`.

---

## 14. AI Endpoints

> Requires `OPENAI_API_KEY` set in `.env`. Without it, bio rewrite and interest suggest will error; starter uses template fallback.

### 14.1 Get AI starter message for a match
```bash
curl -s -H "Authorization: Bearer $TOKEN_A" \
  $API/api/v1/ai/starter/$MATCH_ID
```
**Expected (with API key):** `200` — `{"match_id":"...","starter":"...","tags":[...],"cached":false}`  
**Expected (no API key):** `200` — fallback template starter.

### 14.2 Get cached starter (second call)
```bash
curl -s -H "Authorization: Bearer $TOKEN_A" \
  $API/api/v1/ai/starter/$MATCH_ID
```
**Expected:** `200` — same starter, `"cached": true`.

### 14.3 Rewrite bio
```bash
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  $API/api/v1/ai/bio/rewrite \
  -d '{
    "current_bio": "I do NLP research. I like open source.",
    "tone": "professional"
  }'
```
**Expected:** `200` — `{"rewritten_bio":"..."}` (requires OpenAI key).

### 14.4 Suggest interests from bio
```bash
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  $API/api/v1/ai/interests/suggest \
  -d '{"bio": "I build distributed databases and contribute to open-source storage engines."}'
```
**Expected:** `200` — `{"suggested_interests":["databases","distributed systems","open source",...]}`.

---

## 15. Full End-to-End Flow

Run these in order to exercise the complete happy path:

```
1.  Sign up User A           → get TOKEN_A, ID_A
2.  Sign up User B           → get TOKEN_B, ID_B
3.  PATCH /me (A)            → set profile, looking_for: [collaboration]
4.  PATCH /me (B)            → set profile, looking_for: [collaboration, networking]
5.  GET /interests           → get interest UUIDs
6.  PUT /me/interests (A)    → set 2 interests
7.  POST /me/projects (A)    → add a project
8.  POST /me/links (A)       → add GitHub link
9.  GET /discovery/feed (A)  → see B in feed (score > 0 due to shared city + intents)
10. POST /likes (A → B)      → like with intent "collaboration", match=null
11. POST /likes (B → A)      → like with intent "collaboration", match created!
12. GET /matches (A)         → see new match, save MATCH_ID
13. POST /messages (A)       → send first message
14. POST /messages (B)       → reply
15. GET /messages (A)        → read thread
16. POST /me/availability (A) → add a weekly slot
17. POST /bookings (B)       → B books A
18. PATCH /bookings (A)      → A confirms → gets meeting_url
19. POST /events (A)         → create event → pending_review
    [Admin] POST /admin/events/review → approve it
20. POST /events/rsvp (B)    → B RSVPs
21. GET /notifications (A)   → see new_match + booking_request notifications
22. POST /reports (A)        → report B for spam
23. POST /blocks (A)         → block B → match auto-archived
24. GET /matches/$MATCH_ID   → status is "archived" ✓
```

---

## 16. Quick Error Reference

| Code | Status | Meaning |
|---|---|---|
| `missing_token` | 401 | No Authorization header |
| `token_invalid` | 401 | Bad / expired JWT |
| `token_expired` | 401 | JWT past expiry |
| `not_admin` | 403 | Admin-only endpoint |
| `not_participant` | 403 | Match/booking access denied |
| `not_host` | 403 | Event/booking host required |
| `not_sender` | 403 | Can only edit own messages |
| `profile_not_found` | 404 | Profile doesn't exist |
| `match_not_found` | 404 | Match doesn't exist |
| `booking_not_found` | 404 | Booking doesn't exist |
| `event_not_found` | 404 | Event doesn't exist |
| `message_not_found` | 404 | Message doesn't exist |
| `slot_not_found` | 404 | Availability slot not found |
| `already_liked` | 409 | Duplicate like |
| `already_blocked` | 409 | Already blocking this user |
| `already_rsvped` | 409 | Already RSVPd to event |
| `match_closed` | 403 | Match is closed — can't message |
| `self_like` | 400 | Can't like yourself |
| `self_block` | 400 | Can't block yourself |
| `self_booking` | 400 | Can't book yourself |
| `invalid_transition` | 400 | Illegal booking status change |
| `invalid_status` | 400 | Illegal match status |
| `wrong_side` | 403 | closed_by_a/b mismatch |
| `edit_window_expired` | 409 | Past 15-min message edit window |
| `event_full` | 409 | Event at capacity |
| `event_not_approved` | 409 | Can't RSVP to unapproved event |
| `rate_limited` | 429 | Too many requests — check Retry-After |
| `internal_error` | 500 | Unexpected server error |

---

## 17. OpenAPI Interactive Docs

All endpoints are also testable via the built-in Swagger UI:

```
http://localhost:8002/docs
```

Click **Authorize** → paste `Bearer <token>` → try any endpoint interactively.
