"""
Python mirrors of Postgres enums defined in schema.sql.
These MUST match the actual enum values in the DB exactly.
"""
from enum import StrEnum


class UserRole(StrEnum):
    student = "student"
    professional = "professional"
    researcher = "researcher"
    founder = "founder"
    other = "other"


class SeniorityLevel(StrEnum):
    early = "early"
    mid = "mid"
    senior = "senior"
    unspecified = "unspecified"


class VisibilityType(StrEnum):
    public = "public"
    members_only = "members_only"
    private = "private"


class IntentType(StrEnum):
    dating = "dating"
    collaboration = "collaboration"
    mentorship_mentor = "mentorship_mentor"
    mentorship_mentee = "mentorship_mentee"
    networking = "networking"
    cofounder = "cofounder"


class LinkKind(StrEnum):
    github = "github"
    linkedin = "linkedin"
    scholar = "scholar"
    orcid = "orcid"
    kaggle = "kaggle"
    leetcode = "leetcode"
    personal = "personal"
    twitter = "twitter"
    other = "other"


class MatchStatus(StrEnum):
    active = "active"
    closed_by_a = "closed_by_a"
    closed_by_b = "closed_by_b"
    archived = "archived"


class MessageKind(StrEnum):
    text = "text"
    image = "image"
    file = "file"
    system = "system"
    booking_card = "booking_card"
    event_invite = "event_invite"


class ReportReason(StrEnum):
    harassment = "harassment"
    inappropriate_content = "inappropriate_content"
    fake_profile = "fake_profile"
    spam = "spam"
    underage = "underage"
    safety = "safety"
    other = "other"


class ReportStatus(StrEnum):
    open = "open"
    reviewing = "reviewing"
    resolved = "resolved"
    dismissed = "dismissed"


class EventHostType(StrEnum):
    platform = "platform"
    user = "user"


class EventKind(StrEnum):
    meetup = "meetup"
    hackathon = "hackathon"
    workshop = "workshop"
    paper_reading = "paper_reading"
    talk = "talk"
    coworking = "coworking"
    other = "other"


class EventMode(StrEnum):
    online = "online"
    offline = "offline"
    hybrid = "hybrid"


class EventAttendeeStatus(StrEnum):
    rsvp_going = "rsvp_going"
    rsvp_maybe = "rsvp_maybe"
    waitlist = "waitlist"
    attended = "attended"
    no_show = "no_show"
    cancelled = "cancelled"


class EventApprovalStatus(StrEnum):
    draft = "draft"
    pending_review = "pending_review"
    approved = "approved"
    rejected = "rejected"


class BookingKind(StrEnum):
    coffee = "coffee"
    mentoring = "mentoring"
    project_review = "project_review"
    interview_prep = "interview_prep"
    other = "other"


class BookingStatus(StrEnum):
    pending = "pending"
    confirmed = "confirmed"
    cancelled_by_host = "cancelled_by_host"
    cancelled_by_guest = "cancelled_by_guest"
    completed = "completed"
    no_show = "no_show"


class PaymentStatus(StrEnum):
    not_required = "not_required"
    pending = "pending"
    paid = "paid"
    refunded = "refunded"
    failed = "failed"


class NotificationKind(StrEnum):
    new_match = "new_match"
    new_like = "new_like"
    new_message = "new_message"
    booking_request = "booking_request"
    booking_confirmed = "booking_confirmed"
    booking_cancelled = "booking_cancelled"
    event_reminder = "event_reminder"
    event_starting = "event_starting"
    event_approved = "event_approved"
    event_rejected = "event_rejected"
    system = "system"


class VerificationKind(StrEnum):
    github = "github"
    linkedin = "linkedin"
    scholar = "scholar"
    email = "email"
    phone = "phone"


class FeedbackEventType(StrEnum):
    shown = "shown"
    dwell = "dwell"
    opened = "opened"
    liked = "liked"
    matched = "matched"
    messaged = "messaged"
    rated = "rated"
