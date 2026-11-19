// GG FAMILY only. Local IDs remain stable for history and interrupted sessions.
export function workoutPayload(workout) {
  return {
    name: workout.name.trim(),
    blocks: workout.blocks.map(({ name, items }) => ({ name, items })),
    hr_limit: workout.hrLimit ?? workout.hr_limit ?? null
  };
}

export function sameWorkout(a, b) {
  return JSON.stringify(workoutPayload(a)) === JSON.stringify(workoutPayload(b));
}

export function linkWorkout(local, remote, owner) {
  const { hr_limit, ...payload } = workoutPayload(remote);
  return {
    ...local, ...payload, id: local?.id ?? remote.id, hrLimit: hr_limit,
    ggCloud: { owner, id: remote.id, revision: remote.revision, base: workoutPayload(remote) }
  };
}

export function planWorkout(local, remote) {
  const { revision, base } = local.ggCloud;
  if (!remote) return revision === null ? "insert" : "conflict";
  if (sameWorkout(local, remote)) return "accept";
  if (revision === null) return "conflict";
  const dirty = !sameWorkout(local, base);
  if (remote.revision === revision) return dirty ? "update" : "skip";
  return dirty ? "conflict" : "accept";
}

export function markWorkout(local, previous, owner) {
  if (previous?.ggCloud) return { ...local, ggCloud: previous.ggCloud };
  if (!owner || (previous && sameWorkout(local, previous))) return local;
  return { ...local, ggCloud: { owner, id: crypto.randomUUID(), revision: null, base: null } };
}
