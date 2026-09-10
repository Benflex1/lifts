import { DataSnapshot } from '../database/contract';
import { Gym } from '../types';
import { createScopedId } from './ids';

export interface GymRestoreMapping {
  gymsToInsert: Gym[];
  idMap: Map<string, string>;
}

function isIdenticalNonDefaultGym(source: Gym, destination: Gym): boolean {
  return (
    !source.isDefault &&
    !destination.isDefault &&
    source.id === destination.id &&
    source.name === destination.name &&
    source.color === destination.color
  );
}

export function buildGymRestoreMapping(
  sourceGyms: Gym[],
  destinationGyms: Gym[]
): GymRestoreMapping {
  const destinationDefault = destinationGyms.find((gym) => gym.isDefault)
    || destinationGyms.find((gym) => gym.id === 'gym-default');
  if (!destinationDefault) throw new Error('Destination default gym is missing');

  const sourceIds = new Set<string>();
  for (const gym of sourceGyms) {
    if (sourceIds.has(gym.id)) throw new Error(`Duplicate source gym ID: ${gym.id}`);
    sourceIds.add(gym.id);
  }

  const idMap = new Map<string, string>();
  const gymsToInsert: Gym[] = [];
  const destinationById = new Map(destinationGyms.map((gym) => [gym.id, gym]));
  const usedIds = new Set([...destinationById.keys(), ...sourceIds]);

  for (const source of sourceGyms) {
    if (source.isDefault || source.id === 'gym-default') {
      idMap.set(source.id, destinationDefault.id);
      continue;
    }

    const destination = destinationById.get(source.id);
    if (destination && isIdenticalNonDefaultGym(source, destination)) {
      idMap.set(source.id, destination.id);
      continue;
    }

    let targetId = source.id;
    if (destination) {
      let attempt = 0;
      do {
        const suffix = attempt === 0 ? '' : `-${attempt}`;
        targetId = `gym-import-${createScopedId('restore')}${suffix}`;
        attempt++;
      } while (usedIds.has(targetId) || idMapHasValue(idMap, targetId));
    }

    idMap.set(source.id, targetId);
    usedIds.add(targetId);
    gymsToInsert.push({ ...source, id: targetId, isDefault: false });
  }

  return { gymsToInsert, idMap };
}

function idMapHasValue(idMap: Map<string, string>, value: string): boolean {
  for (const mappedId of idMap.values()) {
    if (mappedId === value) return true;
  }
  return false;
}

export function remapGymReferences(
  snapshot: DataSnapshot,
  idMap: Map<string, string>
): DataSnapshot {
  const remap = (id: string | undefined): string | undefined => (
    id === undefined ? undefined : (idMap.get(id) || id)
  );

  return {
    ...snapshot,
    gyms: snapshot.gyms.reduce<Gym[]>((gyms, gym) => {
      const remappedGym = { ...gym, id: remap(gym.id)! };
      const existingGymIndex = gyms.findIndex((candidate) => candidate.id === remappedGym.id);
      if (existingGymIndex < 0) gyms.push(remappedGym);
      else if (remappedGym.isDefault) gyms[existingGymIndex] = remappedGym;
      return gyms;
    }, []),
    workouts: snapshot.workouts.map((workout) => ({
      ...workout,
      gymId: remap(workout.gymId || 'gym-default')!,
    })),
    drafts: snapshot.drafts.map((draft) => ({
      ...draft,
      workout: {
        ...draft.workout,
        gymId: remap(draft.workout.gymId || 'gym-default')!,
      },
    })),
    exerciseGymScopes: snapshot.exerciseGymScopes.map((scope) => ({
      ...scope,
      ...(scope.linkedGymIds
        ? { linkedGymIds: scope.linkedGymIds.map((gymId) => remap(gymId)!) }
        : {}),
    })),
  };
}
