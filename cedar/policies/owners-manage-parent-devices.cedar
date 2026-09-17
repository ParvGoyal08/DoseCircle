// Only the owner can see and revoke the phones paired to a parent.
permit (
  principal is DoseCircle::Member,
  action == DoseCircle::Action::"ManageDevices",
  resource is DoseCircle::Parent
)
when { principal.family == resource.family && principal.role == "owner" };
