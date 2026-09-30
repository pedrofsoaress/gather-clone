/** One panel closing cannot release movement still claimed by another panel. */
export function createInputLocks(emit) {
    const owners = new Set()
    return (owner, active) => {
        if (active) owners.add(owner)
        else owners.delete(owner)
        emit(owners.size > 0)
    }
}
