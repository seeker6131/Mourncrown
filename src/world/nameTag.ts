// A name tag's look over a hero's head: gold (bold, softly glowing) for the diamond wheel's gold name, else its usual colour.
import type Phaser from 'phaser';
export function nameStyle(t: Phaser.GameObjects.Text, gold: boolean, col: string, stroke: string) {
  t.setColor(gold ? '#ffd23a' : col).setStroke(gold ? '#5a3000' : stroke, 3).setFontStyle(gold ? 'bold' : '').setShadow(0, 0, gold ? '#ffb000' : '#000', gold ? 4 : 0, false, gold);
}
