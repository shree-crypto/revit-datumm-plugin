# Documentation contracts

Documentation creation contracts define bounded, homogeneous payloads for plans, isometric views, sections, sheets and viewport placement.

Documentation operations use explicit loaded types, one kind per batch, and fresh native verification before a transaction group commits. Sheets account for their one selected title block in the receipt as an auxiliary while operation keys identify the sheet. Viewport checks cover content boxes but exclude labels and reserved title-block regions.

The MCP capability gate refuses operations absent from the installed plugin and requires all five for documentation discovery. Contract and build checks do not qualify live Revit behavior; loaded Revit acceptance remains outstanding.
