// A parent's phone can record and see only that parent's own readings.
permit (
  principal is DoseCircle::ParentDevice,
  action in [DoseCircle::Action::"RecordReading", DoseCircle::Action::"ViewReadings"],
  resource is DoseCircle::Parent
)
when { principal.parent == resource };
