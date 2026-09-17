// Any member of the family can look after its parents: medicines, pauses, test reminders and reports.
permit (
  principal is DoseCircle::Member,
  action in [
    DoseCircle::Action::"ViewParent",
    DoseCircle::Action::"ManageMedicines",
    DoseCircle::Action::"PauseReminders",
    DoseCircle::Action::"SendTestReminder",
    DoseCircle::Action::"ViewReport"
  ],
  resource is DoseCircle::Parent
)
when { principal.family == resource.family };
