# 0100: Builds use focused equipment panels

Status: accepted

The build editor and immutable share viewer use the same focused presentation.
A ten-card rail selects Warframe, weapons, Companion, Archwing equipment, or a
combined Operator/Amp panel. The selected item alone supplies the stats,
configuration grid and applicable arcanes. Build metadata, acquisition and
sharing remain outside the loadout rail.

Mod positions are fixed by equipment family rather than freely authored:
Warframes, weapons and Archwings have eight normal positions, Companions have
ten, and Aura, Stance and Exilus use reserved top-row positions. This makes
capacity validation and the odd/even in-game grid deterministic. A second Aura
position is available for equipment whose sourced polarity facts require it.

Equipment and Focus are assumed maxed. Mods default to maximum rank while
allowing a lower saved rank. Source-backed base stats are displayed separately
from a future derived-stat layer so adding mod calculations will not require a
second layout rewrite.
