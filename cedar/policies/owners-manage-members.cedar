// Only an owner can add or remove family members, or delete the family and its records.
permit (
  principal is DoseCircle::Member,
  action in [DoseCircle::Action::"ManageMembers", DoseCircle::Action::"DeleteFamily"],
  resource is DoseCircle::Family
)
when { principal.family == resource && principal.role == "owner" };
