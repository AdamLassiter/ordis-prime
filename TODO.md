# Todos from Human Inspection

These TODO items should be fixed, with written commits as progress is made:

- [x] The foundry plan and directives tread on one-anothers toes a little - I think directives should be more just automated alarms for stuff and foundry plan more of the todo list.
- [x] In the foundry, certain items like Nokko Neuroptics don't list any drop sources.
- [x] The arsenal page should also be laid out more like in-game - a side-menu between each part of the build, mods shown in a grid alongside arcanes etc.
- [x] The manifest should have either better help text on how to import stuff, or an automated way of fetching this data (possibly with a warframe account login)
- [x] the data/unstructured directory has some transcripts for reviews of warframes from some creators - these all need to be turned into a structured data/manual/*.yaml file, but be aware of transcription errors and near-homophone typos.
- [x] Some data update has cuased the app to spit out non-stop errors:
    ```
    apps/web dev: [browser] Encountered two children with the same key, `Salvage: need 75000, 12.65% documented chance`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version. 
    apps/web dev: [browser] Encountered two children with the same key, `Nano Spores: need 150000, 12.65% documented chance`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version. 
    apps/web dev: [browser] Encountered two children with the same key, `Alloy Plate: need 150000, 12.65% documented chance`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version. 
    apps/web dev: [browser] Encountered two children with the same key, `Salvage: need 75000, 12.65% documented chance`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version. 
    ```
    Take caution running the application until this is fixed, as it will just loop endlessly.
- [x] See https://wiki.warframe.com/w/Star_Chart for details on how the star chart should be laid out
    * Consider putting together a simple tool where I can import an image of a given planet and draw out the following:
        - The circular shape of the planet
        - Each quest node on the planet
        - Any junctions between planets
      I will also need to import an image of the zoomed-out chart in its totality and draw out:
        - The circular shape of each planet
        - Any morphs to the arcs between planet junctions (they are all mostly curves)
      The data exported from this can then be used to lay out the chart properly
    * The star chart should start on the zoomed-out view with more of a summary of things on each planet
    * Clicking a planet 'zooms in' to show that planet's nodes and connections, with more details per node
- [x] The codex should have filters for either all data before searching, or search results data after searching, similar to the lozenges that the atlas page shows
- [x] The star chart could therefore probably drop the filters it currently have, instead having options for the level of detail of things shown, multi-selecting from the set of things that might be shown in the zoomed-out sol system view or the zoomed-in per-planet view
- [x] Nokko Blueprint doesn't show any crafting resources (i.e. all the nokko component parts) - I assume other things will be similar
- [x] There will probably be a need to find data for vendors on certain map nodes (e.g. Fortuna on Venus has the vendor Nightcap, who both sells Nokko parts for Fergolyte, and offers Deep-mines bounties with a random drop chance)
- [x] Warframe abilities with specific augment mods don't show up as related data (for example, the Chaos Sphere mod for Nyx's Chaos ability), and also don't show any wiki description
- [x] Primary links (clicking card titles etc.) should stay in-app, external links should always be visibly marked as such (e.g. MUI's open-in-new square with diagonal arrow)
