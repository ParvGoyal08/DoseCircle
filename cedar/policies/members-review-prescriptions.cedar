// Family members can review and confirm their family's prescriptions.
permit (
  principal is DoseCircle::Member,
  action == DoseCircle::Action::"ReviewPrescription",
  resource is DoseCircle::Prescription
)
when { principal.family == resource.family };
