// A parent's own phone can photograph a prescription for their family. Nothing is saved from it
// until a family member ticks every line; the phone can start the reading, not finish it.
permit (
  principal is DoseCircle::ParentDevice,
  action == DoseCircle::Action::"UploadPrescription",
  resource is DoseCircle::Family
)
when { principal.family == resource };
