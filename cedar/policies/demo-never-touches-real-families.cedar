// Guardrail: demo sessions and real families never mix, in either direction.
forbid (
  principal,
  action,
  resource
)
when {
  principal has family &&
  resource has family &&
  principal.family.demo != resource.family.demo
};
