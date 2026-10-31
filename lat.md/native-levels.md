# Native level creation

Level creation is a separately reviewed batch using an existing level as a context anchor, with explicit project elevations in millimetres.

The native bridge checks every existing level name and the proposed names case-insensitively at preview and apply. Each operation creates only a level, never an implicit plan view; after regeneration the name and project elevation are verified before the transaction group commits. The receipt maps operation keys to new UniqueIds and provides the native level readback. A plugin must advertise the operation before the MCP bridge dispatches it. Automated contract checks do not substitute for live Revit qualification.
