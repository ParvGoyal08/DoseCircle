// Guardrail: a revoked phone is refused everything, whatever any other policy says.
forbid (
  principal is DoseCircle::ParentDevice,
  action,
  resource
)
when { principal.revoked };
