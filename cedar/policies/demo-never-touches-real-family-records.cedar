// Guardrail: the same separation when the resource is the family itself.
forbid (
  principal,
  action,
  resource is DoseCircle::Family
)
when { principal has family && principal.family.demo != resource.demo };
