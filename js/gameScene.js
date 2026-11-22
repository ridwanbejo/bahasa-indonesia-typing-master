(function (global) {
  'use strict';

  // Indonesian Flag (Merah Putih) high-contrast arcade tile palette
  const BLOCK_PALETTE = [
    0xce1126, // Bendera Crimson Red
    0xffffff, // Pure Flag White (light)
    0xdc2626, // Vibrant Scarlet Red
    0xf8fafc, // Pearl White (light)
    0x991b1b, // Deep Garuda Maroon
    0xe11d48, // Nusantara Rose Red
  ];

  const LIGHT_TILES = new Set([0xffffff, 0xf8fafc]);

  const FONT_UI = '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const FONT_MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

  const VISIBLE_ROWS = 6;

  const SFX_PATHS = {
    'sfx-success':
      'assets/sfx/vadim_makes_sound-modern-success-confirmation-notification-566072.mp3',
    'sfx-fail':
      'assets/sfx/lesiakower-error-mistake-sound-effect-incorrect-answer-437420.mp3',
  };

  function createSfxPool(src, volume, size = 4) {
    const pool = Array.from({ length: size }, () => {
      const audio = new Audio(src);
      audio.preload = 'auto';
      audio.volume = volume;
      return audio;
    });
    let idx = 0;

    return {
      play(overrideVolume) {
        const audio = pool[idx];
        idx = (idx + 1) % pool.length;
        if (typeof overrideVolume === 'number') {
          audio.volume = overrideVolume;
        }
        try {
          audio.currentTime = 0;
        } catch (_err) {
          // Ignore seek errors before metadata is loaded
        }
        const promise = audio.play();
        if (promise && typeof promise.catch === 'function') {
          promise.catch(() => {});
        }
      },
    };
  }

  class IndoGameScene extends Phaser.Scene {
    constructor() {
      super({ key: 'IndoGameScene' });

      this.isPlaying = false;
      this.config = null;
      this.practiceMode = 'id-to-en'; // 'id-to-en' | 'en-to-id'
      this.callbacks = {};

      this.wordQueue = [];
      this.totalWords = 0;
      this.nextWordIdx = 0;
      this.rowItems = []; // index 0 = active bottom row, index 1..N = stacked above

      this.score = 0;
      this.wordsCleared = 0;
      this.mistakes = 0;
      this.streak = 0;
      this.sessionStartMs = 0;
      this.durationMs = 120000;
      this.remainingMs = 120000;
      this.lastDisplayedSec = -1;

      this.timerEvent = null;
      this.errorResetTimer = null;
      this.bgShapes = [];
      this.colorCursor = 0;

      this.sfxPools = {
        'sfx-success': createSfxPool(SFX_PATHS['sfx-success'], 0.8),
        'sfx-fail': createSfxPool(SFX_PATHS['sfx-fail'], 0.85),
      };
    }

    preload() {}

    create() {
      this.createProceduralTextures();
      this.createBackground();
      this.createPlayfieldRails();
      this.createHUD();
      this.setHUDVisible(false);

      this.scale.on('resize', this.handleResize, this);

      if (global.onPhaserSceneReady) {
        global.onPhaserSceneReady(this);
      }
    }

    update(_time, delta) {
      const w = this.scale.width;
      const h = this.scale.height;
      const dt = delta / 1000;
      const midY = h * 0.5;

      for (const shape of this.bgShapes) {
        shape.obj.y -= shape.speed * dt;
        shape.obj.x += shape.drift * dt;
        shape.obj.rotation += shape.rotSpeed * dt;
        if (shape.obj.y < -60) {
          shape.obj.y = h + 60;
          shape.obj.x = Phaser.Math.Between(40, Math.max(80, w - 40));
        }
        if (shape.obj.x > w + 60) shape.obj.x = -50;
        if (shape.obj.x < -60) shape.obj.x = w + 50;

        // Contrast-aware Merah Putih tint: white on red top half, crimson on white bottom half
        const inRedHalf = shape.obj.y < midY;
        const targetColor = inRedHalf ? 0xffffff : 0xce1126;
        if (shape.lastColor !== targetColor) {
          shape.lastColor = targetColor;
          shape.obj.setFillStyle(targetColor, inRedHalf ? 0.11 : 0.08);
          shape.obj.setStrokeStyle(1.5, targetColor, inRedHalf ? 0.28 : 0.22);
        }
      }
    }

    /**
     * Pure procedural particle textures (zero external image assets).
     */
    createProceduralTextures() {
      if (!this.textures.exists('particle-square')) {
        const g = this.make.graphics({ x: 0, y: 0, add: false });
        g.fillStyle(0xffffff, 1);
        g.fillRoundedRect(0, 0, 14, 14, 3);
        g.generateTexture('particle-square', 14, 14);
        g.destroy();
      }

      if (!this.textures.exists('particle-spark')) {
        const g = this.make.graphics({ x: 0, y: 0, add: false });
        g.fillStyle(0xffffff, 1);
        g.fillPoints(
          [
            { x: 7, y: 0 },
            { x: 14, y: 7 },
            { x: 7, y: 14 },
            { x: 0, y: 7 },
          ],
          true
        );
        g.generateTexture('particle-spark', 14, 14);
        g.destroy();
      }
    }

    /**
     * Indonesian Flag (Merah Putih) atmosphere using pure Phaser Graphics + floating geometric motifs.
     */
    createBackground() {
      this.bgGraphics = this.add.graphics().setDepth(0);
      this.drawBackgroundGrid();

      this.bgShapes = [];
      for (let i = 0; i < 18; i++) {
        const size = Phaser.Math.Between(14, 34);
        const startY = Phaser.Math.Between(0, this.scale.height);
        const inRedHalf = startY < this.scale.height * 0.5;
        const color = inRedHalf ? 0xffffff : 0xce1126;
        const rect = this.add
          .rectangle(
            Phaser.Math.Between(40, Math.max(80, this.scale.width - 40)),
            startY,
            size,
            size,
            color,
            inRedHalf ? 0.11 : 0.08
          )
          .setStrokeStyle(1.5, color, inRedHalf ? 0.28 : 0.22)
          .setRotation(Math.PI / 4)
          .setDepth(1);
        this.bgShapes.push({
          obj: rect,
          lastColor: color,
          speed: Phaser.Math.FloatBetween(10, 26),
          drift: Phaser.Math.FloatBetween(3, 12),
          rotSpeed: Phaser.Math.FloatBetween(-0.22, 0.22),
        });
      }
    }

    drawWaveBand(g, w, h, baseYRatio, amp, freq, phase, color, alpha) {
      g.fillStyle(color, alpha);
      g.beginPath();
      g.moveTo(0, h);
      const steps = 48;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = t * w;
        const y =
          h * baseYRatio +
          Math.sin(t * Math.PI * freq + phase) * amp +
          Math.cos(t * Math.PI * (freq * 0.55) + phase * 1.3) * (amp * 0.4);
        g.lineTo(x, y);
      }
      g.lineTo(w, h);
      g.closePath();
      g.fillPath();
    }

    drawBackgroundGrid() {
      const w = this.scale.width;
      const h = this.scale.height;
      const midY = Math.round(h * 0.5);
      const m = this.getLayoutMetrics();
      const g = this.bgGraphics;
      g.clear();

      // Upper 50%: Sang Saka Merah (Indonesian Flag Crimson Red)
      g.fillGradientStyle(0x991b1b, 0xb91c1c, 0xce1126, 0xb91c1c, 1);
      g.fillRect(0, 0, w, midY);

      // Soft luminous white radiance in the upper crimson field
      const sunX = w * 0.5;
      const sunY = h * 0.22;
      g.fillStyle(0xffffff, 0.06);
      g.fillCircle(sunX, sunY, Math.min(w, h) * 0.34);
      g.fillStyle(0xffffff, 0.07);
      g.fillCircle(sunX, sunY, Math.min(w, h) * 0.2);

      // Lower 50%: Sang Saka Putih (Indonesian Flag Crisp White)
      g.fillGradientStyle(0xffffff, 0xf8fafc, 0xe2e8f0, 0xf1f5f9, 1);
      g.fillRect(0, midY, w, h - midY);

      // Subtle waving silk ribbon transition along the Merah-Putih horizon
      this.drawWaveBand(g, w, h, 0.495, 10, 2.2, 0.4, 0x991b1b, 0.22);
      this.drawWaveBand(g, w, h, 0.505, 9, 2.0, 1.9, 0xffffff, 0.92);
      this.drawWaveBand(g, w, h, 0.86, 16, 1.8, 3.1, 0xfecdd3, 0.28);

      // Crisp flag horizon hairline
      g.lineStyle(2, 0xce1126, 0.28);
      g.lineBetween(0, midY, w, midY);

      // Subtle architectural grid: white over Red half, crimson over White half
      const step = 48;
      g.lineStyle(1, 0xffffff, 0.08);
      for (let x = 0; x < w; x += step) {
        g.lineBetween(x, 0, x, midY);
      }
      for (let y = 0; y < midY; y += step) {
        g.lineBetween(0, y, w, y);
      }

      g.lineStyle(1, 0xce1126, 0.07);
      for (let x = 0; x < w; x += step) {
        g.lineBetween(x, midY, x, h);
      }
      for (let y = midY; y < h; y += step) {
        g.lineBetween(0, y, w, y);
      }

      // Centre high-contrast Merah Putih spotlight column
      const colW = m.colWidth;
      const colH = Math.max(220, h - 270);
      const colX = (w - colW) / 2;
      const colY = 92;

      // Soft outer shadow behind spotlight column
      g.fillStyle(0x450a0a, 0.26);
      g.fillRoundedRect(colX - 4, colY + 6, colW + 8, colH + 4, 26);

      // Deep garnet glass backdrop so both red and white bricks pop with AAA contrast
      g.fillStyle(0x1f070b, 0.86);
      g.fillRoundedRect(colX, colY, colW, colH, 24);

      // Merah Putih double border
      g.lineStyle(3, 0xce1126, 0.88);
      g.strokeRoundedRect(colX, colY, colW, colH, 24);
      g.lineStyle(1.5, 0xffffff, 0.72);
      g.strokeRoundedRect(colX + 4, colY + 4, colW - 8, colH - 8, 20);
    }

    /**
     * Active target rail + pulsing arrows framing the bottom active row.
     */
    createPlayfieldRails() {
      this.railGraphics = this.add.graphics().setDepth(4);

      this.leftPointer = this.add
        .text(0, 0, '▶', {
          fontFamily: FONT_UI,
          fontSize: '26px',
          color: '#ffffff',
          stroke: '#ce1126',
          strokeThickness: 5,
        })
        .setOrigin(0.5)
        .setDepth(12);

      this.rightPointer = this.add
        .text(0, 0, '◀', {
          fontFamily: FONT_UI,
          fontSize: '26px',
          color: '#ffffff',
          stroke: '#ce1126',
          strokeThickness: 5,
        })
        .setOrigin(0.5)
        .setDepth(12);

      this.tweens.add({
        targets: [this.leftPointer, this.rightPointer],
        scale: 1.18,
        duration: 460,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });

      this.stackLayer = this.add.container(0, 0).setDepth(10);
    }

    /**
     * Build the Merah Putih HUD directly in Phaser:
     * - Top-Left: Time remaining + word progress
     * - Top-Right: Score (+10 per word) + streak / mistakes
     * - Bottom-Left: Active target word + character count + letter breakdown + field tag
     * - Bottom-Right (Upper): Bahasa Indonesia OR English Syllable Minimap (above Translation minimap)
     * - Bottom-Right (Lower): Translation Minimap (English in ID mode, Indonesian in EN mode)
     */
    createHUD() {
      this.hudContainer = this.add.container(0, 0).setDepth(20);

      // --- TOP LEFT: TIME ---
      this.timePanelBg = this.add.graphics();
      this.timeTitleText = this.add.text(0, 0, 'TIME', {
        fontFamily: FONT_UI,
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#fecdd3',
        letterSpacing: 2,
      });
      this.timeValueText = this.add.text(0, 0, '02:00', {
        fontFamily: FONT_MONO,
        fontSize: '34px',
        fontStyle: 'bold',
        color: '#ffffff',
      });
      this.progressText = this.add.text(0, 0, 'Words: 0 / 0', {
        fontFamily: FONT_UI,
        fontSize: '13px',
        fontStyle: '600',
        color: '#fda4af',
      });

      // --- TOP RIGHT: SCORE ---
      this.scorePanelBg = this.add.graphics();
      this.scoreTitleText = this.add
        .text(0, 0, 'SCORE', {
          fontFamily: FONT_UI,
          fontSize: '12px',
          fontStyle: 'bold',
          color: '#fecdd3',
          letterSpacing: 2,
        })
        .setOrigin(1, 0);
      this.scoreValueText = this.add
        .text(0, 0, '0', {
          fontFamily: FONT_MONO,
          fontSize: '34px',
          fontStyle: 'bold',
          color: '#ffffff',
        })
        .setOrigin(1, 0);
      this.streakText = this.add
        .text(0, 0, 'Mistakes: 0', {
          fontFamily: FONT_UI,
          fontSize: '13px',
          fontStyle: '600',
          color: '#fda4af',
        })
        .setOrigin(1, 0);

      // --- BOTTOM LEFT: ACTIVE TARGET WORD PREVIEW ---
      this.wordPanelBg = this.add.graphics();
      this.wordHeaderText = this.add.text(0, 0, 'BAHASA INDONESIA', {
        fontFamily: FONT_UI,
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#fecdd3',
        letterSpacing: 1.5,
      });
      this.countBadgeBg = this.add.graphics();
      this.countBadgeText = this.add
        .text(0, 0, '0 chars', {
          fontFamily: FONT_MONO,
          fontSize: '11px',
          fontStyle: 'bold',
          color: '#991b1b',
        })
        .setOrigin(0.5);
      this.wordValueText = this.add.text(0, 0, '', {
        fontFamily: FONT_UI,
        fontSize: '26px',
        fontStyle: 'bold',
        color: '#ffffff',
        padding: { left: 2, right: 2, top: 6, bottom: 6 },
      });
      this.wordLettersText = this.add.text(0, 0, '', {
        fontFamily: FONT_MONO,
        fontSize: '12px',
        fontStyle: '600',
        color: '#fecdd3',
        padding: { left: 2, right: 2, top: 3, bottom: 3 },
      });
      this.wordFieldText = this.add.text(0, 0, '', {
        fontFamily: FONT_UI,
        fontSize: '11px',
        fontStyle: '700',
        color: '#fde68a',
      });

      // --- BOTTOM RIGHT (UPPER): SYLLABLE MINIMAP (INDONESIAN OR ENGLISH) ---
      this.syllablePanelBg = this.add.graphics();
      this.syllableHeaderText = this.add.text(0, 0, 'INDONESIAN SYLLABLES', {
        fontFamily: FONT_UI,
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#fecdd3',
        letterSpacing: 1.4,
      });
      this.syllableBadgeBg = this.add.graphics();
      this.syllableBadgeText = this.add
        .text(0, 0, '0 syl', {
          fontFamily: FONT_MONO,
          fontSize: '11px',
          fontStyle: 'bold',
          color: '#991b1b',
        })
        .setOrigin(0.5);
      this.syllableTilesContainer = this.add.container(0, 0);
      this.syllableBreakdownText = this.add.text(0, 0, '', {
        fontFamily: FONT_MONO,
        fontSize: '12px',
        fontStyle: '600',
        color: '#f8fafc',
      });

      // --- BOTTOM RIGHT (LOWER): TRANSLATION MINIMAP ---
      this.translationPanelBg = this.add.graphics();
      this.translationHeaderText = this.add.text(0, 0, 'ENGLISH TRANSLATION', {
        fontFamily: FONT_UI,
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#fecdd3',
        letterSpacing: 1.4,
      });
      this.translationValueText = this.add.text(0, 0, '', {
        fontFamily: FONT_UI,
        fontSize: '24px',
        fontStyle: 'bold',
        color: '#ffffff',
        padding: { left: 2, right: 2, top: 6, bottom: 6 },
      });
      this.translationSubText = this.add.text(0, 0, '', {
        fontFamily: FONT_UI,
        fontSize: '12px',
        fontStyle: '600',
        color: '#fda4af',
        padding: { left: 2, right: 2, top: 4, bottom: 4 },
      });

      this.hudContainer.add([
        this.timePanelBg,
        this.timeTitleText,
        this.timeValueText,
        this.progressText,
        this.scorePanelBg,
        this.scoreTitleText,
        this.scoreValueText,
        this.streakText,
        this.wordPanelBg,
        this.wordHeaderText,
        this.countBadgeBg,
        this.countBadgeText,
        this.wordValueText,
        this.wordLettersText,
        this.wordFieldText,
        this.syllablePanelBg,
        this.syllableHeaderText,
        this.syllableBadgeBg,
        this.syllableBadgeText,
        this.syllableTilesContainer,
        this.syllableBreakdownText,
        this.translationPanelBg,
        this.translationHeaderText,
        this.translationValueText,
        this.translationSubText,
      ]);

      this.layoutHUD();
    }

    setHUDVisible(visible) {
      this.hudContainer.setVisible(visible);
      this.railGraphics.setVisible(visible);
      this.leftPointer.setVisible(visible);
      this.rightPointer.setVisible(visible);
    }

    /**
     * Responsive desktop layout metrics for 4-corner + stacked bottom-right minimap HUD and centre stack.
     */
    getLayoutMetrics() {
      const w = this.scale.width;
      const h = this.scale.height;

      const margin = 22;
      const topCardW = 215;
      const topCardH = 88;
      const sideCardW = Phaser.Math.Clamp(Math.floor(w * 0.23), 252, 344);
      const sideCardH = h < 620 ? 136 : 150;
      const translationCardH = h < 620 ? 104 : 114;
      const syllableCardH = h < 620 ? 124 : 140;
      const minimapGap = 12;

      const centerClearW = Math.max(420, w - (sideCardW + margin) * 2 - 28);
      const colWidth = Math.min(860, centerClearW);
      const maxRowWidth = Math.min(810, colWidth - 36);

      const playTop = 108;
      const playBottom = h - 186;
      const playHeight = Math.max(240, playBottom - playTop);
      const rowPitch = Phaser.Math.Clamp(Math.floor((playHeight - 24) / VISIBLE_ROWS), 54, 82);
      const baseBrickHeight = Phaser.Math.Clamp(rowPitch - 12, 44, 68);
      const baseY = playBottom - Math.round(baseBrickHeight / 2) - 10;

      return {
        w,
        h,
        margin,
        topCardW,
        topCardH,
        sideCardW,
        sideCardH,
        translationCardH,
        syllableCardH,
        minimapGap,
        colWidth,
        centerX: Math.round(w / 2),
        baseY,
        rowPitch,
        baseBrickHeight,
        maxRowWidth,
      };
    }

    layoutHUD() {
      const m = this.getLayoutMetrics();

      // Top-Left: TIME
      this.drawHudCard(this.timePanelBg, m.margin, m.margin, m.topCardW, m.topCardH);
      this.timeTitleText.setPosition(m.margin + 16, m.margin + 14);
      this.timeValueText.setPosition(m.margin + 16, m.margin + 28);
      this.progressText.setPosition(m.margin + 16, m.margin + 66);

      // Top-Right: SCORE
      const scoreX = m.w - m.margin - m.topCardW;
      this.drawHudCard(this.scorePanelBg, scoreX, m.margin, m.topCardW, m.topCardH);
      this.scoreTitleText.setPosition(m.w - m.margin - 16, m.margin + 14);
      this.scoreValueText.setPosition(m.w - m.margin - 16, m.margin + 28);
      this.streakText.setPosition(m.w - m.margin - 16, m.margin + 66);

      // Bottom-Left: ACTIVE TARGET WORD PREVIEW
      const bottomLeftY = m.h - m.margin - m.sideCardH;
      this.drawHudCard(this.wordPanelBg, m.margin, bottomLeftY, m.sideCardW, m.sideCardH);
      this.wordHeaderText.setPosition(m.margin + 16, bottomLeftY + 15);
      this.wordValueText.setPosition(m.margin + 16, bottomLeftY + 38);
      this.wordLettersText.setPosition(m.margin + 16, bottomLeftY + m.sideCardH - 54);
      this.wordFieldText.setPosition(m.margin + 16, bottomLeftY + m.sideCardH - 26);
      this.drawCountBadge(m.margin + m.sideCardW - 46, bottomLeftY + 23);

      // Bottom-Right (LOWER): TRANSLATION MINIMAP
      const rightX = m.w - m.margin - m.sideCardW;
      const transY = m.h - m.margin - m.translationCardH;
      this.drawHudCard(
        this.translationPanelBg,
        rightX,
        transY,
        m.sideCardW,
        m.translationCardH
      );
      this.translationHeaderText.setPosition(rightX + 16, transY + 15);
      this.translationValueText.setPosition(rightX + 16, transY + 36);
      this.translationSubText.setPosition(rightX + 16, transY + m.translationCardH - 28);

      // Bottom-Right (UPPER): SYLLABLE MINIMAP (directly above Translation minimap)
      const sylY = transY - m.minimapGap - m.syllableCardH;
      this.drawHudCard(
        this.syllablePanelBg,
        rightX,
        sylY,
        m.sideCardW,
        m.syllableCardH
      );
      this.syllableHeaderText.setPosition(rightX + 16, sylY + 15);
      this.syllableTilesContainer.setPosition(
        rightX + Math.round(m.sideCardW / 2),
        sylY + Math.round(m.syllableCardH * 0.56)
      );
      this.syllableBreakdownText.setPosition(rightX + 16, sylY + m.syllableCardH - 24);
      this.drawSyllableBadge(rightX + m.sideCardW - 40, sylY + 23);

      this.updateActiveRailPosition();
    }

    /**
     * Draw a high-contrast Merah Putih HUD card with a miniature Red-over-White Indonesian flag ribbon.
     */
    drawHudCard(g, x, y, width, height) {
      g.clear();
      // Drop shadow for crisp separation over the white lower half
      g.fillStyle(0x450a0a, 0.25);
      g.fillRoundedRect(x + 2, y + 4, width, height, 14);

      // Deep crimson-charcoal card body
      g.fillStyle(0x23080d, 0.94);
      g.fillRoundedRect(x, y, width, height, 14);

      // Merah Putih miniature flag top ribbon (Red over White)
      g.fillStyle(0xce1126, 1);
      g.fillRoundedRect(x + 2, y + 2, width - 4, 4, { tl: 12, tr: 12, bl: 0, br: 0 });
      g.fillStyle(0xffffff, 0.95);
      g.fillRect(x + 2, y + 6, width - 4, 3);

      // Crisp border
      g.lineStyle(2, 0xce1126, 0.92);
      g.strokeRoundedRect(x, y, width, height, 14);
    }

    drawCountBadge(cx, cy) {
      const active = this.rowItems[0];
      const blocks = active ? this.getTargetBlocks(active.vocab) : [];
      const count = blocks.length;
      const label = count === 1 ? '1 char' : `${count} chars`;

      this.countBadgeBg.clear();
      this.countBadgeBg.fillStyle(0xffffff, 0.96);
      this.countBadgeBg.fillRoundedRect(cx - 32, cy - 10, 64, 20, 8);
      this.countBadgeText.setText(label).setPosition(cx, cy);
    }

    drawSyllableBadge(cx, cy) {
      const active = this.rowItems[0];
      const syllables = active ? this.getActiveSyllables(active.vocab) : [];
      const count = syllables.length;
      const label = `${count} syl`;

      this.syllableBadgeBg.clear();
      this.syllableBadgeBg.fillStyle(0xffffff, 0.96);
      this.syllableBadgeBg.fillRoundedRect(cx - 26, cy - 10, 52, 20, 8);
      this.syllableBadgeText.setText(label).setPosition(cx, cy);
    }

    updateActiveRailPosition() {
      const m = this.getLayoutMetrics();
      const active = this.rowItems[0];
      const activeWidth = active ? active.rowWidth : 280;
      const railHalfW = Math.min(m.maxRowWidth / 2, activeWidth / 2 + 26);

      this.railGraphics.clear();
      if (this.isPlaying && active) {
        const railY = m.baseY + Math.round(active.brickHeight / 2) + 8;
        // Merah Putih glowing rail (crimson outer + crisp white core)
        this.railGraphics.fillStyle(0xce1126, 0.72);
        this.railGraphics.fillRoundedRect(m.centerX - railHalfW, railY - 2, railHalfW * 2, 10, 5);
        this.railGraphics.fillStyle(0xffffff, 0.96);
        this.railGraphics.fillRoundedRect(m.centerX - railHalfW + 6, railY, railHalfW * 2 - 12, 4, 2);

        this.leftPointer.setPosition(m.centerX - railHalfW - 22, m.baseY).setVisible(true);
        this.rightPointer.setPosition(m.centerX + railHalfW + 22, m.baseY).setVisible(true);
      } else {
        this.leftPointer.setVisible(false);
        this.rightPointer.setVisible(false);
      }
    }

    handleResize() {
      this.drawBackgroundGrid();
      this.layoutHUD();
      this.relayoutStackImmediate();
      if (this.isPlaying) {
        this.updateActiveWordDisplay();
      }
    }

    playSfx(key, volume) {
      const pool = this.sfxPools[key];
      if (!pool) return;
      pool.play(volume);
    }

    getTargetBlocks(vocab) {
      return this.practiceMode === 'en-to-id' ? vocab.enBlocks : vocab.idBlocks;
    }

    getActiveSyllables(vocab) {
      return this.practiceMode === 'en-to-id' ? vocab.enSyllables : vocab.idSyllables;
    }

    getActiveSyllableBreakdown(vocab) {
      return this.practiceMode === 'en-to-id'
        ? vocab.enSyllableBreakdown
        : vocab.idSyllableBreakdown;
    }

    /**
     * Switch practice mode live during a session without losing score, queue, or timer.
     * @param {'id-to-en' | 'en-to-id'} mode
     */
    setPracticeMode(mode) {
      const normalized = mode === 'en-to-id' ? 'en-to-id' : 'id-to-en';
      if (this.practiceMode === normalized) return;
      this.practiceMode = normalized;
      if (this.config) {
        this.config.practiceMode = normalized;
      }

      if (!this.isPlaying) return;

      if (this.errorResetTimer) {
        this.errorResetTimer.remove(false);
        this.errorResetTimer = null;
      }

      const activeVocabs = this.rowItems.map((r) => r.vocab);
      for (const row of this.rowItems) {
        if (row.container && row.container.active) {
          row.container.destroy();
        }
      }
      this.rowItems = [];
      this.stackLayer.removeAll(true);

      activeVocabs.forEach((vocab, slot) => {
        const row = this.createWordRow(vocab, slot);
        this.rowItems.push(row);
      });

      this.updateActiveWordDisplay();
    }

    /**
     * Start a new typing session with the generated word list and user config.
     */
    startSession(words, config, callbacks) {
      this.cleanupSession();

      this.config = Object.assign({}, config);
      this.practiceMode = config.practiceMode === 'en-to-id' ? 'en-to-id' : 'id-to-en';
      this.callbacks = callbacks || {};
      this.wordQueue = words.slice();
      this.totalWords = this.wordQueue.length;
      this.nextWordIdx = 0;

      this.score = 0;
      this.wordsCleared = 0;
      this.mistakes = 0;
      this.streak = 0;
      this.colorCursor = 0;

      this.durationMs = config.minutes * 60 * 1000;
      this.remainingMs = this.durationMs;
      this.lastDisplayedSec = -1;
      this.sessionStartMs = performance.now();
      this.isPlaying = true;

      if (this.sound.context && this.sound.context.state === 'suspended') {
        this.sound.context.resume().catch(() => {});
      }

      this.setHUDVisible(true);
      this.layoutHUD();

      const initialCount = Math.min(VISIBLE_ROWS, this.wordQueue.length);
      for (let slot = 0; slot < initialCount; slot++) {
        const vocab = this.wordQueue[this.nextWordIdx++];
        const row = this.createWordRow(vocab, slot);
        this.rowItems.push(row);

        const targetY = row.container.y;
        row.container.y = targetY - 90 - slot * 20;
        row.container.alpha = 0;
        this.tweens.add({
          targets: row.container,
          y: targetY,
          alpha: this.getSlotAlpha(slot),
          duration: 320 + slot * 45,
          ease: 'Back.easeOut',
        });
      }

      this.updateHUDValues();
      this.updateActiveWordDisplay();
      this.updateTimerDisplay(true);

      this.timerEvent = this.time.addEvent({
        delay: 100,
        loop: true,
        callback: () => this.tickTimer(),
      });
    }

    cleanupSession() {
      this.isPlaying = false;

      if (this.timerEvent) {
        this.timerEvent.remove(false);
        this.timerEvent = null;
      }
      if (this.errorResetTimer) {
        this.errorResetTimer.remove(false);
        this.errorResetTimer = null;
      }

      for (const row of this.rowItems) {
        if (row.container && row.container.active) {
          row.container.destroy();
        }
      }
      this.rowItems = [];
      this.stackLayer.removeAll(true);
      if (this.syllableTilesContainer) {
        this.syllableTilesContainer.removeAll(true);
      }
    }

    getSlotAlpha(slot) {
      if (slot === 0) return 1;
      return Math.max(0.56, 0.92 - slot * 0.08);
    }

    getSlotScale(slot) {
      return slot === 0 ? 1.0 : 0.9;
    }

    /**
     * Build a horizontal LTR row of 3D Merah Putih letter blocks (with compact space & hyphen tiles).
     */
    createWordRow(vocab, slot) {
      const m = this.getLayoutMetrics();
      const blocks = this.getTargetBlocks(vocab);
      const count = blocks.length;
      const gap = count >= 14 ? 3 : count >= 10 ? 4 : count >= 7 ? 6 : 8;

      // Weight each block width so spaces and hyphens stay compact
      const weights = blocks.map((b) => (b.isSpace ? 0.52 : b.isHyphen ? 0.72 : 1));
      const totalWeight = weights.reduce((acc, val) => acc + val, 0);

      const idealBrickW = Math.round(m.baseBrickHeight * 1.04);
      const maxBrickFromWidth = Math.floor(
        (m.maxRowWidth - gap * Math.max(0, count - 1)) / Math.max(1, totalWeight)
      );
      const baseBrickW = Phaser.Math.Clamp(
        Math.min(idealBrickW, maxBrickFromWidth),
        28,
        idealBrickW
      );
      const brickH = Phaser.Math.Clamp(
        Math.min(m.baseBrickHeight, Math.round(baseBrickW * 1.08)),
        36,
        m.baseBrickHeight
      );

      const brickWidths = weights.map((wt) => Math.max(16, Math.round(baseBrickW * wt)));
      const totalWidth =
        brickWidths.reduce((acc, w) => acc + w, 0) + Math.max(0, count - 1) * gap;

      const rowY = m.baseY - slot * m.rowPitch;
      const container = this.add.container(m.centerX, rowY);
      container.setScale(this.getSlotScale(slot));
      container.setAlpha(this.getSlotAlpha(slot));

      const bricks = [];
      let cursorX = -totalWidth / 2;
      const rowColorOffset = this.colorCursor;
      this.colorCursor = (this.colorCursor + 1) % BLOCK_PALETTE.length;

      let letterIndex = 0;

      blocks.forEach((blk, idx) => {
        const bw = brickWidths[idx];
        const bx = cursorX + bw / 2;
        cursorX += bw + gap;

        const isSpace = blk.isSpace;
        const colorHex = isSpace
          ? 0x450a0a
          : BLOCK_PALETTE[(rowColorOffset + letterIndex) % BLOCK_PALETTE.length];
        if (!isSpace) letterIndex += 1;

        const brickContainer = this.add.container(bx, 0);
        const bg = this.add.graphics();
        this.paintBrick(bg, bw, brickH, colorHex, false, slot === 0, isSpace);

        const baseFontSize = Math.round(brickH * (isSpace ? 0.36 : 0.48));
        const isLightTile = !isSpace && LIGHT_TILES.has(colorHex);
        const glyph = isSpace ? '␣' : blk.text;
        const label = this.add
          .text(0, isSpace ? 2 : 0, glyph, {
            fontFamily: isSpace ? FONT_MONO : FONT_UI,
            fontSize: `${baseFontSize}px`,
            fontStyle: 'bold',
            color: isSpace ? '#fda4af' : isLightTile ? '#881337' : '#ffffff',
            stroke: isSpace ? '#1f070b' : isLightTile ? '#ffe4e6' : '#450a0a',
            strokeThickness: isLightTile ? 1 : 3,
            padding: { left: 4, right: 4, top: 8, bottom: 8 },
          })
          .setOrigin(0.5);

        const maxInnerW = Math.max(8, bw - 8);
        const maxInnerH = Math.max(10, brickH - 8);
        const rawW = Math.max(1, label.width - 8);
        const rawH = Math.max(1, label.height - 16);
        const fitScale = Math.min(1, maxInnerW / rawW, maxInnerH / rawH);
        if (fitScale < 1) {
          label.setScale(fitScale);
        }

        brickContainer.add([bg, label]);
        container.add(brickContainer);

        bricks.push({
          container: brickContainer,
          bg,
          label,
          text: blk.text,
          isSpace,
          baseColor: colorHex,
          isLightTile,
          width: bw,
          height: brickH,
          localX: bx,
        });
      });

      this.stackLayer.add(container);

      return {
        vocab,
        container,
        bricks,
        brickWidth: baseBrickW,
        brickHeight: brickH,
        rowWidth: totalWidth,
        isErrorHighlighted: false,
      };
    }

    /**
     * Draw a single glossy 3D Merah Putih brick (or recessed spacebar slot) with Phaser Graphics.
     */
    paintBrick(g, width, height, fillHex, isError, isActive, isSpace) {
      g.clear();
      const halfW = width / 2;
      const halfH = height / 2;
      const radius = Math.max(6, Math.round(Math.min(width, height) * 0.18));

      if (isSpace && !isError) {
        g.fillStyle(0x2b0a10, 0.75);
        g.fillRoundedRect(-halfW, -halfH + 6, width, height - 12, radius);
        g.lineStyle(1.5, 0xfda4af, isActive ? 0.65 : 0.3);
        g.strokeRoundedRect(-halfW, -halfH + 6, width, height - 12, radius);
        return;
      }

      const mainColor = isError ? 0xef4444 : fillHex;
      const colorObj = Phaser.Display.Color.IntegerToColor(mainColor);
      const darkBevel = Phaser.Display.Color.GetColor(
        Math.max(0, colorObj.red - 48),
        Math.max(0, colorObj.green - 48),
        Math.max(0, colorObj.blue - 48)
      );

      // Drop shadow
      g.fillStyle(0x120306, 0.5);
      g.fillRoundedRect(-halfW + 2, -halfH + 5, width, height, radius);

      // Outer crimson glow on error
      if (isError) {
        g.fillStyle(0xff2e4c, 0.38);
        g.fillRoundedRect(-halfW - 5, -halfH - 5, width + 10, height + 10, radius + 4);
      }

      // Main brick body
      g.fillStyle(mainColor, 1);
      g.fillRoundedRect(-halfW, -halfH, width, height, radius);

      // Bottom 3D bevel lip
      g.fillStyle(darkBevel, 0.92);
      g.fillRoundedRect(-halfW + 1, halfH - 7, width - 2, 7, {
        tl: 0,
        tr: 0,
        bl: radius,
        br: radius,
      });

      // Top highlight strip
      const isLight = !isError && LIGHT_TILES.has(mainColor);
      g.fillStyle(isLight ? 0xffe4e6 : 0xffffff, isLight ? 0.5 : isError ? 0.22 : 0.28);
      g.fillRoundedRect(
        -halfW + 4,
        -halfH + 4,
        Math.max(4, width - 8),
        Math.max(5, Math.round(height * 0.15)),
        4
      );

      // Crisp border
      if (isError) {
        g.lineStyle(3, 0xffffff, 1);
      } else if (isActive) {
        g.lineStyle(2.5, isLight ? 0xce1126 : 0xffffff, 0.95);
      } else {
        g.lineStyle(1.5, isLight ? 0xce1126 : 0xffffff, 0.35);
      }
      g.strokeRoundedRect(-halfW, -halfH, width, height, radius);
    }

    relayoutStackImmediate() {
      const m = this.getLayoutMetrics();
      this.rowItems.forEach((row, slot) => {
        row.container.setPosition(m.centerX, m.baseY - slot * m.rowPitch);
        row.container.setScale(this.getSlotScale(slot));
        row.container.setAlpha(this.getSlotAlpha(slot));
      });
      this.updateActiveRailPosition();
    }

    /**
     * Evaluate submitted input against the active bottom row according to practiceMode.
     * @param {string} rawInput
     * @returns {'correct' | 'incorrect' | 'ignored'}
     */
    submitAnswer(rawInput) {
      if (!this.isPlaying || this.rowItems.length === 0) return 'ignored';

      const activeRow = this.rowItems[0];
      const loader = global.IndoVocabLoader;
      const typed = loader.normalizeInput(rawInput);
      if (!typed) return 'ignored';

      const acceptedList =
        this.practiceMode === 'en-to-id'
          ? activeRow.vocab.enAccepted
          : activeRow.vocab.idAccepted;

      const isMatch = acceptedList.includes(typed);
      if (isMatch) {
        this.handleCorrectWord(activeRow);
        return 'correct';
      }

      this.handleIncorrectWord(activeRow);
      return 'incorrect';
    }

    /**
     * Success: play confirmation SFX, explode blocks with Merah Putih sparks, award +10, drop stack down.
     */
    handleCorrectWord(activeRow) {
      if (this.errorResetTimer) {
        this.errorResetTimer.remove(false);
        this.errorResetTimer = null;
      }

      this.playSfx('sfx-success', 0.75);

      this.score += 10;
      this.wordsCleared += 1;
      this.streak += 1;

      const rowWorldX = activeRow.container.x;
      const rowWorldY = activeRow.container.y;

      activeRow.bricks.forEach((brick, idx) => {
        const wx = rowWorldX + brick.localX;
        const wy = rowWorldY;

        if (!brick.isSpace) {
          const burst = this.add.particles(wx, wy, 'particle-square', {
            speed: { min: 110, max: 320 },
            angle: { min: 0, max: 360 },
            scale: { start: 1.0, end: 0 },
            alpha: { start: 1, end: 0 },
            lifespan: { min: 380, max: 720 },
            gravityY: 440,
            rotate: { min: -240, max: 240 },
            tint: brick.baseColor,
            emitting: false,
          });
          burst.setDepth(18);
          burst.explode(10);
          this.time.delayedCall(780, () => burst.destroy());

          const sparks = this.add.particles(wx, wy, 'particle-spark', {
            speed: { min: 150, max: 360 },
            angle: { min: 0, max: 360 },
            scale: { start: 0.85, end: 0 },
            alpha: { start: 1, end: 0 },
            lifespan: { min: 260, max: 500 },
            tint: [0xffffff, 0xce1126],
            emitting: false,
          });
          sparks.setDepth(19);
          sparks.explode(5);
          this.time.delayedCall(560, () => sparks.destroy());
        }

        activeRow.container.remove(brick.container, false);
        this.add.existing(brick.container);
        brick.container.setPosition(wx, wy);
        brick.container.setDepth(16);

        const spread = idx - (activeRow.bricks.length - 1) / 2;
        const targetX = wx + spread * Phaser.Math.Between(42, 80) + Phaser.Math.Between(-28, 28);
        const targetY = wy - Phaser.Math.Between(70, 145);

        this.tweens.add({
          targets: brick.container,
          x: targetX,
          y: targetY,
          angle: Phaser.Math.Between(-150, 150),
          scale: 0.15,
          alpha: 0,
          duration: 450,
          ease: 'Cubic.easeOut',
          onComplete: () => brick.container.destroy(),
        });
      });

      activeRow.container.destroy();

      // Floating "+10" score burst
      const plusTen = this.add
        .text(rowWorldX, rowWorldY - 12, '+10', {
          fontFamily: FONT_MONO,
          fontSize: '34px',
          fontStyle: 'bold',
          color: '#ffffff',
          stroke: '#ce1126',
          strokeThickness: 6,
        })
        .setOrigin(0.5)
        .setDepth(25);

      this.tweens.add({
        targets: plusTen,
        y: rowWorldY - 96,
        scale: 1.3,
        alpha: 0,
        duration: 680,
        ease: 'Cubic.easeOut',
        onComplete: () => plusTen.destroy(),
      });

      this.cameras.main.shake(95, 0.003);

      // Advance stack
      this.rowItems.shift();

      if (this.nextWordIdx < this.wordQueue.length) {
        const nextVocab = this.wordQueue[this.nextWordIdx++];
        const topSlot = this.rowItems.length;
        const newRow = this.createWordRow(nextVocab, topSlot);
        const m = this.getLayoutMetrics();
        newRow.container.y = m.baseY - (topSlot + 1) * m.rowPitch - 30;
        newRow.container.alpha = 0;
        this.rowItems.push(newRow);
      }

      const m = this.getLayoutMetrics();
      this.rowItems.forEach((row, slot) => {
        const isNowActive = slot === 0;
        if (isNowActive) {
          row.bricks.forEach((b) =>
            this.paintBrick(b.bg, b.width, b.height, b.baseColor, false, true, b.isSpace)
          );
        }

        this.tweens.add({
          targets: row.container,
          y: m.baseY - slot * m.rowPitch,
          scale: this.getSlotScale(slot),
          alpha: this.getSlotAlpha(slot),
          duration: 320,
          ease: 'Bounce.easeOut',
        });
      });

      this.updateHUDValues();
      this.tweens.add({
        targets: this.scoreValueText,
        scale: 1.28,
        duration: 110,
        yoyo: true,
        ease: 'Quad.easeOut',
      });

      if (this.rowItems.length === 0) {
        this.updateActiveWordDisplay();
        this.time.delayedCall(420, () => {
          if (this.isPlaying) {
            this.endSession('completed');
          }
        });
        return;
      }

      this.updateActiveWordDisplay();
    }

    /**
     * Failure: play error SFX, flash blocks bright alert red, shake horizontally, allow retry.
     */
    handleIncorrectWord(activeRow) {
      this.playSfx('sfx-fail', 0.78);

      this.mistakes += 1;
      this.streak = 0;
      this.updateHUDValues();

      activeRow.isErrorHighlighted = true;
      activeRow.bricks.forEach((brick) => {
        this.paintBrick(brick.bg, brick.width, brick.height, brick.baseColor, true, true, brick.isSpace);
        brick.label.setColor('#ffffff');
        brick.label.setStroke('#7f1d1d', 3);
      });

      const m = this.getLayoutMetrics();
      this.tweens.killTweensOf(activeRow.container);
      activeRow.container.x = m.centerX;
      this.tweens.add({
        targets: activeRow.container,
        x: m.centerX + 14,
        duration: 45,
        yoyo: true,
        repeat: 4,
        ease: 'Sine.easeInOut',
        onComplete: () => {
          if (activeRow.container && activeRow.container.active) {
            activeRow.container.x = m.centerX;
          }
        },
      });

      const errLabel = this.add
        .text(m.centerX, m.baseY - activeRow.brickHeight / 2 - 22, '✗ Incorrect', {
          fontFamily: FONT_UI,
          fontSize: '18px',
          fontStyle: 'bold',
          color: '#ffffff',
          stroke: '#991b1b',
          strokeThickness: 5,
        })
        .setOrigin(0.5)
        .setDepth(25);

      this.tweens.add({
        targets: errLabel,
        y: errLabel.y - 26,
        alpha: 0,
        duration: 700,
        ease: 'Cubic.easeOut',
        onComplete: () => errLabel.destroy(),
      });

      if (this.errorResetTimer) {
        this.errorResetTimer.remove(false);
      }
      this.errorResetTimer = this.time.delayedCall(850, () => {
        if (!activeRow.container || !activeRow.container.active) return;
        activeRow.isErrorHighlighted = false;
        activeRow.bricks.forEach((brick) => {
          this.paintBrick(
            brick.bg,
            brick.width,
            brick.height,
            brick.baseColor,
            false,
            true,
            brick.isSpace
          );
          if (brick.isSpace) {
            brick.label.setColor('#fda4af');
            brick.label.setStroke('#1f070b', 3);
          } else {
            brick.label.setColor(brick.isLightTile ? '#881337' : '#ffffff');
            brick.label.setStroke(
              brick.isLightTile ? '#ffe4e6' : '#450a0a',
              brick.isLightTile ? 1 : 3
            );
          }
        });
      });
    }

    updateHUDValues() {
      this.scoreValueText.setText(String(this.score));
      this.progressText.setText(`Words: ${this.wordsCleared} / ${this.totalWords}`);
      this.streakText.setText(
        this.streak > 1 ? `Streak: x${this.streak}` : `Mistakes: ${this.mistakes}`
      );
    }

    /**
     * Render LTR Merah Putih mini-tiles inside the Syllable Minimap card
     * (shows Indonesian syllables in ID→EN mode, English syllables in EN→ID mode).
     * Automatically wraps to 2 compact rows when a term has more than 5 syllables.
     */
    renderSyllableMinimap(vocab, maxInnerW) {
      this.syllableTilesContainer.removeAll(true);
      const syllables = this.getActiveSyllables(vocab);
      if (!syllables || syllables.length === 0) return;

      const tileColors = [0xce1126, 0xffffff, 0xb91c1c, 0xf8fafc, 0x991b1b, 0xffe4e6];
      const useTwoRows = syllables.length > 5;
      const rows = useTwoRows
        ? [
            syllables.slice(0, Math.ceil(syllables.length / 2)),
            syllables.slice(Math.ceil(syllables.length / 2)),
          ]
        : [syllables];

      const tileH = useTwoRows ? 28 : 36;
      const rowGap = 6;
      const startY = useTwoRows ? -(tileH + rowGap) / 2 : 0;

      let globalIdx = 0;

      rows.forEach((rowSyls, rIdx) => {
        const gap = rowSyls.length >= 5 ? 4 : 6;
        const idealTileW = useTwoRows ? 54 : 60;
        const tileW = Phaser.Math.Clamp(
          Math.floor((maxInnerW - gap * Math.max(0, rowSyls.length - 1)) / Math.max(1, rowSyls.length)),
          28,
          idealTileW
        );
        const totalW = rowSyls.length * tileW + Math.max(0, rowSyls.length - 1) * gap;
        const startX = -totalW / 2 + tileW / 2;
        const ty = startY + rIdx * (tileH + rowGap);

        rowSyls.forEach((syl, idx) => {
          const tx = startX + idx * (tileW + gap);
          const bgColor = tileColors[globalIdx % tileColors.length];
          const isLight = bgColor === 0xffffff || bgColor === 0xf8fafc || bgColor === 0xffe4e6;
          globalIdx += 1;

          const tileBg = this.add.graphics();
          tileBg.fillStyle(bgColor, 0.96);
          tileBg.fillRoundedRect(tx - tileW / 2, ty - tileH / 2, tileW, tileH, 7);
          tileBg.lineStyle(1.5, isLight ? 0xce1126 : 0xffffff, 0.8);
          tileBg.strokeRoundedRect(tx - tileW / 2, ty - tileH / 2, tileW, tileH, 7);

          const fontSize = useTwoRows
            ? syl.text.length >= 4
              ? 11
              : 13
            : syl.text.length >= 4
              ? 13
              : 16;

          const tileText = this.add
            .text(tx, ty, syl.text, {
              fontFamily: FONT_UI,
              fontSize: `${fontSize}px`,
              fontStyle: 'bold',
              color: isLight ? '#991b1b' : '#ffffff',
              padding: { left: 3, right: 3, top: 3, bottom: 3 },
            })
            .setOrigin(0.5);

          const rawW = Math.max(1, tileText.width - 6);
          if (rawW > tileW - 6) {
            tileText.setScale((tileW - 6) / rawW);
          }

          this.syllableTilesContainer.add([tileBg, tileText]);
        });
      });
    }

    /**
     * Refresh Bottom-Left Target Word card, Bottom-Right Upper Syllable Minimap,
     * and Bottom-Right Lower Translation Minimap.
     */
    updateActiveWordDisplay() {
      const active = this.rowItems[0];
      const m = this.getLayoutMetrics();

      if (!active) {
        this.wordValueText.setText('');
        this.wordLettersText.setText('');
        this.wordFieldText.setText('');
        this.syllableTilesContainer.removeAll(true);
        this.syllableBreakdownText.setText('');
        this.translationValueText.setText('');
        this.translationSubText.setText('');
        this.updateActiveRailPosition();
        return;
      }

      const vocab = active.vocab;
      const isIndoMode = this.practiceMode === 'id-to-en';
      const maxCardInnerW = m.sideCardW - 32;

      // 1. Bottom-Left: Active Target Word + Field tag
      if (isIndoMode) {
        this.wordHeaderText.setText('BAHASA INDONESIA');
        const idLen = vocab.idLen;
        const wordFontSize = idLen > 14 ? 19 : idLen > 10 ? 22 : 26;
        this.wordValueText.setFontSize(`${wordFontSize}px`).setText(vocab.indonesian);
        this.wordLettersText.setText(vocab.idLetterBreakdown);
        this.wordFieldText.setText(`Bidang: ${vocab.field}`);
      } else {
        this.wordHeaderText.setText('ENGLISH WORD');
        const enLen = vocab.enLen;
        const wordFontSize = enLen > 14 ? 19 : enLen > 10 ? 22 : 26;
        this.wordValueText.setFontSize(`${wordFontSize}px`).setText(vocab.english);
        this.wordLettersText.setText(vocab.enLetterBreakdown);
        this.wordFieldText.setText(`Field: ${vocab.field}`);
      }

      this.wordValueText.setScale(1);
      if (this.wordValueText.width > maxCardInnerW) {
        this.wordValueText.setScale(maxCardInnerW / this.wordValueText.width);
      }
      this.wordLettersText.setScale(1);
      if (this.wordLettersText.width > maxCardInnerW) {
        this.wordLettersText.setScale(maxCardInnerW / this.wordLettersText.width);
      }
      this.wordFieldText.setScale(1);
      if (this.wordFieldText.width > maxCardInnerW) {
        this.wordFieldText.setScale(maxCardInnerW / this.wordFieldText.width);
      }

      // 2. Bottom-Right (UPPER): Indonesian OR English Syllable Minimap
      this.syllableHeaderText.setText(
        isIndoMode ? 'INDONESIAN SYLLABLES' : 'ENGLISH SYLLABLES'
      );
      this.renderSyllableMinimap(vocab, maxCardInnerW);
      this.syllableBreakdownText.setText(this.getActiveSyllableBreakdown(vocab));
      this.syllableBreakdownText.setScale(1);
      if (this.syllableBreakdownText.width > maxCardInnerW) {
        this.syllableBreakdownText.setScale(maxCardInnerW / this.syllableBreakdownText.width);
      }

      // 3. Bottom-Right (LOWER): Translation Minimap
      if (isIndoMode) {
        this.translationHeaderText.setText('ENGLISH TRANSLATION');
        const enFontSize = vocab.enLen > 14 ? 18 : vocab.enLen > 10 ? 21 : 24;
        this.translationValueText.setFontSize(`${enFontSize}px`).setText(vocab.english);
        this.translationSubText.setText(`Type Bahasa Indonesia (${vocab.idLen} chars)`);
      } else {
        this.translationHeaderText.setText('INDONESIAN TRANSLATION');
        const idFontSize = vocab.idLen > 14 ? 18 : vocab.idLen > 10 ? 21 : 24;
        this.translationValueText.setFontSize(`${idFontSize}px`).setText(vocab.indonesian);
        this.translationSubText.setText(`Type English (${vocab.enLen} chars)`);
      }

      this.translationValueText.setScale(1);
      if (this.translationValueText.width > maxCardInnerW) {
        this.translationValueText.setScale(maxCardInnerW / this.translationValueText.width);
      }
      this.translationSubText.setScale(1);
      if (this.translationSubText.width > maxCardInnerW) {
        this.translationSubText.setScale(maxCardInnerW / this.translationSubText.width);
      }

      const bottomLeftY = m.h - m.margin - m.sideCardH;
      const rightX = m.w - m.margin - m.sideCardW;
      const transY = m.h - m.margin - m.translationCardH;
      const sylY = transY - m.minimapGap - m.syllableCardH;

      this.drawCountBadge(m.margin + m.sideCardW - 46, bottomLeftY + 23);
      this.drawSyllableBadge(rightX + m.sideCardW - 40, sylY + 23);
      this.updateActiveRailPosition();
    }

    tickTimer() {
      if (!this.isPlaying) return;

      const elapsed = performance.now() - this.sessionStartMs;
      this.remainingMs = Math.max(0, this.durationMs - elapsed);
      this.updateTimerDisplay(false);

      if (this.remainingMs <= 0) {
        this.endSession('timeout');
      }
    }

    updateTimerDisplay(force) {
      const totalSec = Math.ceil(this.remainingMs / 1000);
      if (!force && totalSec === this.lastDisplayedSec) return;
      this.lastDisplayedSec = totalSec;

      const mins = Math.floor(totalSec / 60);
      const secs = totalSec % 60;
      const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      this.timeValueText.setText(formatted);

      if (totalSec <= 15) {
        this.timeValueText.setColor('#fca5a5');
        this.tweens.add({
          targets: this.timeValueText,
          scale: 1.12,
          duration: 130,
          yoyo: true,
        });
      } else if (totalSec <= 30) {
        this.timeValueText.setColor('#fde68a');
      } else {
        this.timeValueText.setColor('#ffffff');
      }
    }

    /**
     * Stop gameplay and report Score, WPM, Accuracy, and Elapsed Time.
     * @param {'timeout' | 'completed' | 'quit'} reason
     */
    endSession(reason) {
      if (!this.isPlaying) return;
      this.isPlaying = false;

      if (this.timerEvent) {
        this.timerEvent.remove(false);
        this.timerEvent = null;
      }

      const elapsedMs =
        reason === 'timeout'
          ? this.durationMs
          : Math.max(1000, performance.now() - this.sessionStartMs);
      const elapsedSeconds = elapsedMs / 1000;
      const elapsedMinutes = Math.max(elapsedSeconds / 60, 1 / 60);

      const wpm = this.wordsCleared / elapsedMinutes;
      const totalAttempts = this.wordsCleared + this.mistakes;
      const accuracy = totalAttempts > 0 ? Math.round((this.wordsCleared / totalAttempts) * 100) : 0;

      this.updateActiveRailPosition();

      if (this.callbacks && typeof this.callbacks.onGameOver === 'function') {
        this.callbacks.onGameOver({
          reason,
          practiceMode: this.practiceMode,
          score: this.score,
          wordsCleared: this.wordsCleared,
          totalWords: this.totalWords,
          mistakes: this.mistakes,
          elapsedSeconds,
          wpm,
          accuracy,
        });
      }
    }
  }

  global.IndoGameScene = IndoGameScene;
})(window);
