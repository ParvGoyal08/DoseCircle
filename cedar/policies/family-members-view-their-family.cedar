// A family member can see their own family: parents, members and open alerts.
permit (
  principal is DoseCircle::Member,
  action == DoseCircle::Action::"ViewFamily",
  resource is DoseCircle::Family
)
when { principal.family == resource };
