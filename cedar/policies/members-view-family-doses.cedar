// Family members can see any dose in their family and why they were alerted about it.
permit (
  principal is DoseCircle::Member,
  action in [DoseCircle::Action::"ViewDose", DoseCircle::Action::"ViewTimeline"],
  resource is DoseCircle::Dose
)
when { principal.family == resource.family };
