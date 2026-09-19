// Only an owner can remove a person the family looks after, with their medicines and history.
permit (
  principal is DoseCircle::Member,
  action == DoseCircle::Action::"RemoveParent",
  resource is DoseCircle::Parent
)
when { principal.family == resource.family && principal.role == "owner" };
