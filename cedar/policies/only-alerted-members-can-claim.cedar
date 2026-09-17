// "I'll handle it" is only for someone who has actually been alerted about this dose.
permit (
  principal is DoseCircle::Member,
  action == DoseCircle::Action::"ClaimDose",
  resource is DoseCircle::Dose
)
when {
  principal.family == resource.family &&
  resource.status == "ESCALATING" &&
  resource.alertedMembers.contains(principal)
};
