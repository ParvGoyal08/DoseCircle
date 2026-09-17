// Any member of the family can look after its parents: medicines, daily checks, readings, pauses,
// test reminders and reports.
permit (
  principal is DoseCircle::Member,
  action in [
    DoseCircle::Action::"ViewParent",
    DoseCircle::Action::"ManageMedicines",
    DoseCircle::Action::"ManageChecks",
    DoseCircle::Action::"RecordReading",
    DoseCircle::Action::"ViewReadings",
    DoseCircle::Action::"PauseReminders",
    DoseCircle::Action::"SendTestReminder",
    DoseCircle::Action::"ViewReport"
  ],
  resource is DoseCircle::Parent
)
when { principal.family == resource.family };
