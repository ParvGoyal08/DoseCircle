// A parent's paired phone can see that parent's day, and nobody else's.
permit (
  principal is DoseCircle::ParentDevice,
  action == DoseCircle::Action::"ViewParent",
  resource is DoseCircle::Parent
)
when { principal.parent == resource };
