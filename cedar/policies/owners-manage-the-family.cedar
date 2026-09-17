// Only the family's owner can invite people and change the order family members are alerted in.
permit (
  principal is DoseCircle::Member,
  action == DoseCircle::Action::"ManageFamily",
  resource is DoseCircle::Family
)
when { principal.family == resource && principal.role == "owner" };
