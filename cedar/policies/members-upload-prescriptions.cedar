// Family members can photograph a prescription for their family.
permit (
  principal is DoseCircle::Member,
  action == DoseCircle::Action::"UploadPrescription",
  resource is DoseCircle::Family
)
when { principal.family == resource };
