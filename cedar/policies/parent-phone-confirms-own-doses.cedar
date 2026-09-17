// A parent's phone can open and confirm only that parent's doses.
permit (
  principal is DoseCircle::ParentDevice,
  action in [DoseCircle::Action::"ViewDose", DoseCircle::Action::"MarkTaken"],
  resource is DoseCircle::Dose
)
when { principal.parent == resource.parent };
