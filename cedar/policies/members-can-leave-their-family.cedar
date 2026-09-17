// Anyone can leave their own family. The server still refuses to leave the family without an owner.
permit (
  principal is DoseCircle::Member,
  action == DoseCircle::Action::"LeaveFamily",
  resource is DoseCircle::Family
)
when { principal.family == resource };
