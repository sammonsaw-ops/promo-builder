// Entry point for the Instructions button. Takes the current app language
// (rather than reading a global) so this module has no cross-module
// dependencies — main.js passes currentLang through when calling.
export function openInstructions(lang) {
  renderInstructionsDoc(lang === 'fr' ? 'fr' : 'en');
}

// Shared CSS for both language variants of the instructions popup.
const INSTRUCTIONS_CSS = `
  :root {
    --accent:#2563eb; --accent-light:#eff6ff; --accent-mid:#bfdbfe;
    --gray-50:#f7f8fa; --gray-100:#f0f2f5; --gray-200:#e4e7ed;
    --gray-400:#98a2b3; --gray-500:#667085; --gray-600:#475467;
    --gray-700:#344054; --gray-800:#1d2939; --gray-900:#101828;
    --success:#16a34a; --gold:#d97706;
    --font:'Plus Jakarta Sans',system-ui,sans-serif;
  }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:var(--font); background:#fff; color:var(--gray-900); font-size:9.5pt; line-height:1.55; }
  .page { max-width:780px; margin:0 auto; padding:32px 36px 36px; }
  .doc-header { display:flex; align-items:center; justify-content:space-between; padding-bottom:14px; border-bottom:2.5px solid var(--accent); margin-bottom:20px; }
  .doc-title h1 { font-size:16pt; font-weight:800; color:var(--gray-900); letter-spacing:-0.02em; line-height:1.1; }
  .doc-title p  { font-size:8.5pt; color:var(--gray-400); font-weight:500; margin-top:3px; letter-spacing:0.04em; text-transform:uppercase; }
  .doc-badge { background:var(--accent-light); color:var(--accent); border:1px solid var(--accent-mid); font-size:7.5pt; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; padding:4px 10px; border-radius:20px; white-space:nowrap; }
  .intro { background:var(--gray-50); border-left:3px solid var(--accent); border-radius:0 7px 7px 0; padding:10px 14px; margin-bottom:20px; font-size:9pt; color:var(--gray-700); }
  .steps-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:18px; }
  .step { border:1.5px solid var(--gray-200); border-radius:9px; overflow:hidden; }
  .step-head { display:flex; align-items:center; gap:9px; padding:8px 12px; background:var(--gray-50); border-bottom:1px solid var(--gray-200); }
  .step-num { width:22px; height:22px; border-radius:50%; background:var(--accent); color:#fff; font-size:7.5pt; font-weight:800; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
  .step-label { font-size:8pt; font-weight:700; color:var(--gray-700); letter-spacing:0.05em; text-transform:uppercase; }
  .step-body { padding:10px 12px; }
  .step-body p { font-size:8.5pt; color:var(--gray-600); margin-bottom:5px; }
  .step-body p:last-child { margin-bottom:0; }
  .step-body strong { color:var(--gray-800); }
  .step.full { grid-column:1/-1; }
  .tag { display:inline-block; background:var(--accent-light); color:var(--accent); border:1px solid var(--accent-mid); border-radius:4px; font-size:7pt; font-weight:700; padding:1px 6px; letter-spacing:0.04em; vertical-align:middle; }
  .tag.green { background:#f0fdf4; color:var(--success); border-color:#bbf7d0; }
  .tag.gold  { background:#fffbeb; color:var(--gold); border-color:#fde68a; }
  .field-table { width:100%; border-collapse:collapse; margin-top:6px; }
  .field-table th { font-size:7pt; font-weight:700; color:var(--gray-500); text-transform:uppercase; letter-spacing:0.07em; padding:4px 8px; border-bottom:1.5px solid var(--gray-200); text-align:left; background:var(--gray-50); }
  .field-table td { font-size:8pt; padding:5px 8px; border-bottom:1px solid var(--gray-100); color:var(--gray-700); vertical-align:top; }
  .field-table tr:last-child td { border-bottom:none; }
  .field-name { font-weight:600; color:var(--gray-800); white-space:nowrap; }
  .tips-row { display:grid; grid-template-columns:1fr; gap:10px; margin-bottom:18px; }
  .tip { background:var(--gray-50); border:1px solid var(--gray-200); border-radius:8px; padding:10px 12px; }
  .tip-icon { font-size:14pt; margin-bottom:4px; display:block; }
  .tip h4 { font-size:8pt; font-weight:700; color:var(--gray-800); margin-bottom:3px; }
  .tip p  { font-size:8pt; color:var(--gray-600); line-height:1.45; }
  .dl-section { background:linear-gradient(135deg,#eff6ff 0%,#f0fdf4 100%); border:1.5px solid var(--accent-mid); border-radius:9px; padding:12px 16px; margin-bottom:18px; display:flex; align-items:center; gap:14px; }
  .dl-section .dl-icon { font-size:22pt; flex-shrink:0; }
  .dl-section h3 { font-size:9.5pt; font-weight:700; color:var(--gray-900); margin-bottom:3px; }
  .dl-section p  { font-size:8.5pt; color:var(--gray-600); }
  .disclaimer { background:var(--gray-50); border:1px solid var(--gray-200); border-radius:7px; padding:9px 13px; }
  .disclaimer p { font-size:7.5pt; color:var(--gray-400); line-height:1.5; text-align:center; }
  .disclaimer strong { color:var(--gray-500); }
  @media print { body { font-size:8.5pt; } .page { padding:18px 22px; } }
`;

// Localized text/HTML fragments for the instructions popup. Structure is
// identical between languages; only the copy varies.
const INSTRUCTIONS_STRINGS = {
  en: {
    htmlLang: 'en',
    title: 'Promo Builder — Instructions for Use',
    h1: 'Promo Builder',
    subtitle: `Instructions for Use &nbsp;·&nbsp; by Sammons Creative`,
    intro: `The <strong>Promo Builder</strong> lets you create professional, digital and print-ready raffle promotional banners in seconds — no design experience required. Follow the three steps on the left panel, then generate and download your banner. <strong>Nothing you enter is ever stored or uploaded</strong> — all processing happens in your browser.`,
    step1Label: 'Banner Type',
    step1Body: `
      <p>Choose the style of banner you want to create:</p>
      <p><strong>Standard <span class="tag">🎟️</span></strong> — A clean, versatile design suitable for any raffle or fundraiser.</p>
      <p><strong>Sport <span class="tag">🏆</span></strong> — Adds a sport-themed graphic element (puck, ball, etc.) to the centre of the banner. After selecting Sport, choose your sport from the icon grid that appears below.</p>
      <p style="margin-top:6px;font-size:7.5pt;color:var(--gray-400);">Available sports: Hockey, Soccer, Football, Baseball, Softball, Basketball, Water Polo, Volleyball, Ringette, Curling, Gymnastics, Golf, Figure Skating, Lacrosse, Rugby, Tennis, Swimming, AFL, and Wrestling/MMA.</p>`,
    step2Label: 'Output Format',
    step2Body: `
      <p>Select the <strong>aspect ratio</strong> that matches where you plan to use the banner:</p>
      <table class="field-table">
        <thead><tr><th>Ratio</th><th>Best For</th></tr></thead>
        <tbody>
          <tr><td class="field-name">4:5</td><td>Instagram portrait posts</td></tr>
          <tr><td class="field-name">1:1</td><td>Square social posts</td></tr>
          <tr><td class="field-name">1.91:1</td><td>Facebook &amp; Twitter banners</td></tr>
          <tr><td class="field-name">16:9</td><td>Widescreen / presentation slides</td></tr>
          <tr><td class="field-name">9:16</td><td>Instagram/Facebook Stories, TikTok</td></tr>
          <tr><td class="field-name">Letter <span class="tag gold">Print</span></td><td>Physical print poster — 8.5 × 11 in at 300 DPI. Renders with a 1/2-inch white border so it prints safely on any home or office printer. When QR Code is selected, two QR Codes appear — one in each lower corner for easy wall-mounted viewing.</td></tr>
        </tbody>
      </table>`,
    step3Label: 'Raffle Details',
    step3Body: `
      <p style="margin-bottom:8px;">Fill in the fields below to build your banner content. All fields are optional — only what you enter will appear on the banner.</p>
      <table class="field-table">
        <thead><tr><th style="width:30%">Field</th><th>What to Enter</th></tr></thead>
        <tbody>
          <tr><td class="field-name">Organization Name</td><td>Your team, club, or group name (e.g. <em>Northside Hockey Association</em>). Appears prominently on the banner.</td></tr>
          <tr><td class="field-name">Raffle Type</td><td><span class="tag green">50/50 Raffle</span> — Winner takes 50% of ticket sales up to a maximum prize. &nbsp; <span class="tag gold">Prize Raffle</span> — A fixed item or cash prize is awarded. &nbsp; <span class="tag" style="background:#fdf4ff;color:#7c3aed;border-color:#e9d5ff;">Tirage moitié-moitié</span> / <span class="tag" style="background:#fdf4ff;color:#7c3aed;border-color:#e9d5ff;">Tirage de Prix</span> — French-language versions; selecting either will switch the entire interface to French.</td></tr>
          <tr><td class="field-name">Team / Club Logo</td><td>Upload a PNG, JPG, or GIF logo. It will be placed on the banner. For best results use a high-resolution file with a <strong>transparent</strong> or white background. <span style="color:#b45309;font-weight:600;">⚠️ Do not use images with a baked-in checkerboard pattern</span> (see Image Tips below).</td></tr>
          <tr><td class="field-name">Prize Image <span class="tag" style="font-size:6.5pt">Prize Raffle only</span></td><td>Optional photo of the prize. Appears only when <em>Prize Raffle</em> or <em>Tirage de Prix</em> is selected. For best results, use a PNG with a transparent or white background.</td></tr>
          <tr><td class="field-name">Ticket Purchase URL</td><td>Paste a link to your online ticket sales page. The tool will automatically generate a <strong>QR code</strong> and place it in the corner of the banner.</td></tr>
          <tr><td class="field-name">Include Detailed Info <span class="tag" style="font-size:6.5pt">Toggle</span></td><td>Click the toggle switch to reveal additional fields: Ticket Packages, Total Tickets Available, Maximum Possible Sales, Prize Description, Licence Number, Draw Date, Draw Time, and Draw Location. Enter only the details you wish to display. <strong>Note:</strong> When this toggle is turned on, the detailed information will be displayed inside the banner shape and will supersede any other content within that area — including a prize image.</td></tr>
          <tr><td class="field-name">Ticket Packages</td><td>Enter one or more pricing tiers (e.g. <em>3 tickets for $10</em>). Click <strong>+ Add Package</strong> to add more rows.</td></tr>
          <tr><td class="field-name">Draw Date &amp; Time</td><td>Select the date and time of the draw. Both fields are optional — omit either if not yet confirmed.</td></tr>
          <tr><td class="field-name">Draw Location</td><td>Full address of where the draw will take place (e.g. <em>123 Arena Way, Cityville, AB T2P 1A1</em>).</td></tr>
        </tbody>
      </table>`,
    tipImgH4: 'Image Tips',
    tipImgP: 'Use high-resolution logos (at least 500 × 500 px). PNG files with transparent backgrounds produce the cleanest results on the banner.',
    tipCheckerH4: 'Avoid "Baked-In" Checkerboard Backgrounds',
    tipCheckerP1: `Some images have a <strong>grey-and-white checkerboard pattern</strong> embedded directly into the image pixels. This pattern is used by image editors (Photoshop, GIMP, etc.) to <em>represent</em> transparency — but if the image was saved incorrectly (e.g. as a JPG, or as a PNG without the alpha channel), the checkerboard becomes permanent and <strong>cannot be removed</strong> by this tool.`,
    tipCheckerBadLabel: '&#10060; BAD — Baked-in checkerboard',
    tipCheckerGoodLabel: '&#9989; GOOD — Real transparency (PNG)',
    tipCheckerP2: `<strong>How to fix it:</strong> Open the original file in an image editor, ensure the background is truly transparent (you should see the checkerboard in the editor but it should <em>not</em> be part of the saved file), then export as a <strong>PNG with transparency</strong> enabled. Re-upload the corrected file.`,
    dlH3: 'Generating &amp; Downloading Your Banner',
    dlP: `Once you are satisfied with the preview, click the blue <strong>Generate Banner</strong> button at the bottom of the left panel. The banner will render in full resolution in the right panel. Click <strong>Download PNG</strong> to save the image to your device. The file is named automatically using your organization name, sport (if selected), and aspect ratio.`,
    disclaimer: `<strong>Disclaimer:</strong> This is a free tool provided by Sammons Creative at no charge. The end user is solely responsible for reviewing all banner content for accuracy, errors, spelling, dates, and legal compliance (including raffle licence requirements) before printing or publishing. Sammons Creative assumes no liability for mistakes or omissions in the generated output. No information or images entered into this tool are stored, saved, or transmitted to any server.`,
  },
  fr: {
    htmlLang: 'fr',
    title: `Générateur de bannières — Guide d'utilisation`,
    h1: 'Générateur de bannières de tirage',
    subtitle: `Guide d'utilisation &nbsp;·&nbsp; par Sammons Creative`,
    intro: `Le <strong>Générateur de bannières de tirage</strong> vous permet de créer des bannières promotionnelles professionnelles — prêtes pour le numérique et l'impression — en quelques secondes, sans aucune expérience en conception graphique. Suivez les trois étapes du panneau de gauche, puis générez et téléchargez votre bannière. <strong>Aucune information que vous saisissez n'est jamais stockée ni téléversée</strong> — tout le traitement se fait dans votre navigateur.`,
    step1Label: 'Type de bannière',
    step1Body: `
      <p>Choisissez le style de bannière que vous souhaitez créer :</p>
      <p><strong>Standard <span class="tag">🎟️</span></strong> — Un design épuré et polyvalent, adapté à tout tirage ou collecte de fonds.</p>
      <p><strong>Sport <span class="tag">🏆</span></strong> — Ajoute un élément graphique thématique (rondelle, ballon, etc.) au centre de la bannière. Après avoir sélectionné Sport, choisissez votre sport dans la grille d'icônes qui apparaît.</p>
      <p style="margin-top:6px;font-size:7.5pt;color:var(--gray-400);">Sports disponibles : Hockey, Soccer, Football, Baseball, Softball, Basketball, Water-polo, Volleyball, Ringette, Curling, Gymnastique, Golf, Patinage artistique, Crosse, Rugby, Tennis, Natation, AFL, Lutte/AMM et plus.</p>`,
    step2Label: 'Format de sortie',
    step2Body: `
      <p>Sélectionnez le <strong>format d'image</strong> qui correspond à l'utilisation prévue de la bannière :</p>
      <table class="field-table">
        <thead><tr><th>Format</th><th>Idéal pour</th></tr></thead>
        <tbody>
          <tr><td class="field-name">4:5</td><td>Publications portrait sur Instagram</td></tr>
          <tr><td class="field-name">1:1</td><td>Publications carrées sur les réseaux sociaux</td></tr>
          <tr><td class="field-name">1.91:1</td><td>Bannières Facebook et LinkedIn</td></tr>
          <tr><td class="field-name">16:9</td><td>Écran large / diaporamas</td></tr>
          <tr><td class="field-name">9:16</td><td>Stories Instagram/Facebook, TikTok</td></tr>
          <tr><td class="field-name">Letter <span class="tag gold">Impression</span></td><td>Affiche imprimée — 8,5 × 11 po à 300 DPI. Générée avec une bordure blanche de 1/2 po pour une impression sécurisée sur toute imprimante. Avec un code QR, deux codes apparaissent — un dans chaque coin inférieur.</td></tr>
        </tbody>
      </table>`,
    step3Label: 'Détails du tirage',
    step3Body: `
      <p style="margin-bottom:8px;">Remplissez les champs ci-dessous pour construire le contenu de votre bannière. Tous les champs sont facultatifs — seul ce que vous saisissez apparaîtra sur la bannière.</p>
      <table class="field-table">
        <thead><tr><th style="width:32%">Champ</th><th>Quoi saisir</th></tr></thead>
        <tbody>
          <tr><td class="field-name">Nom de l'organisme</td><td>Le nom de votre équipe, club ou groupe (ex. : <em>Association de hockey Northside</em>). Apparaît en évidence sur la bannière.</td></tr>
          <tr><td class="field-name">Type de tirage</td><td><span class="tag green">Tirage moitié-moitié</span> — Le gagnant reçoit 50 % des ventes de billets. &nbsp; <span class="tag gold">Tirage de Prix</span> — Un article ou un montant en argent fixe est attribué comme prix.</td></tr>
          <tr><td class="field-name">Logo de l'équipe / club</td><td>Téléversez un logo PNG, JPG ou GIF. Il sera placé sur la bannière. Pour de meilleurs résultats, utilisez un fichier haute résolution avec un fond <strong>transparent</strong> ou blanc. <span style="color:#b45309;font-weight:600;">⚠️ N'utilisez pas d'images avec un fond en damier intégré</span> (voir la section Conseils sur les images ci-dessous).</td></tr>
          <tr><td class="field-name">Image du prix <span class="tag" style="font-size:6.5pt">Tirage de Prix seul.</span></td><td>Photo optionnelle du prix (voiture, forfait voyage, etc.). Apparaît uniquement lorsque <em>Tirage de Prix</em> est sélectionné. Pour de meilleurs résultats, utilisez un PNG avec un fond transparent ou blanc.</td></tr>
          <tr><td class="field-name">URL d'achat de billets</td><td>Collez un lien vers votre page de vente de billets en ligne. L'outil générera automatiquement un <strong>code QR</strong> et le placera dans le coin de la bannière.</td></tr>
          <tr><td class="field-name">Inclure les informations détaillées <span class="tag" style="font-size:6.5pt">Bouton</span></td><td>Cliquez sur le bouton pour afficher les champs supplémentaires : Forfaits de billets, Total de billets disponibles, Ventes maximales possibles, Description du prix, Numéro de licence, Date du tirage, Heure du tirage et Lieu du tirage. Saisissez uniquement les détails que vous souhaitez afficher. <strong>Remarque :</strong> Lorsque ce bouton est activé, les informations détaillées s'affichent à l'intérieur de la forme de la bannière et remplacent tout autre contenu dans cette zone — y compris une image du prix.</td></tr>
          <tr><td class="field-name">Forfaits de billets</td><td>Entrez une ou plusieurs tranches de prix (ex. : <em>3 billets pour 10 $</em>). Cliquez sur <strong>+ Ajouter un forfait</strong> pour ajouter des rangées.</td></tr>
          <tr><td class="field-name">Date et heure du tirage</td><td>Sélectionnez la date et l'heure du tirage. Les deux champs sont facultatifs.</td></tr>
          <tr><td class="field-name">Lieu du tirage</td><td>Adresse complète où se déroulera le tirage (ex. : <em>123, rue de l'Aréna, Villeville, QC H2X 1A1</em>).</td></tr>
        </tbody>
      </table>`,
    tipImgH4: 'Conseils sur les images',
    tipImgP: 'Utilisez des logos haute résolution (au moins 500 × 500 px). Les fichiers PNG avec des fonds transparents produisent les résultats les plus nets sur la bannière.',
    tipCheckerH4: 'Évitez les fonds en damier « intégrés »',
    tipCheckerP1: `Certaines images ont un <strong>motif de damier gris et blanc</strong> directement intégré dans les pixels de l'image. Ce motif est utilisé par les éditeurs d'images (Photoshop, GIMP, etc.) pour <em>représenter</em> la transparence — mais si l'image a été enregistrée incorrectement (par ex. en JPG, ou en PNG sans couche alpha), le damier devient permanent et <strong>ne peut pas être supprimé</strong> par cet outil.`,
    tipCheckerBadLabel: '&#10060; MAUVAIS — Damier intégré',
    tipCheckerGoodLabel: '&#9989; BON — Transparence réelle (PNG)',
    tipCheckerP2: `<strong>Comment corriger :</strong> Ouvrez le fichier original dans un éditeur d'images, assurez-vous que le fond est véritablement transparent (vous devriez voir le damier dans l'éditeur mais il ne devrait <em>pas</em> faire partie du fichier enregistré), puis exportez en tant que <strong>PNG avec transparence</strong> activée. Retéléversez le fichier corrigé.`,
    dlH3: 'Générer et télécharger votre bannière',
    dlP: `Lorsque vous êtes satisfait de l'aperçu, cliquez sur le bouton bleu <strong>Générer la bannière</strong> en bas du panneau de gauche. La bannière s'affichera en pleine résolution dans le panneau de droite. Cliquez sur <strong>Télécharger PNG</strong> pour enregistrer l'image sur votre appareil. Le fichier est nommé automatiquement selon le nom de votre organisme, le sport (si sélectionné) et le format d'image.`,
    disclaimer: `<strong>Avis de non-responsabilité :</strong> Cet outil est fourni gratuitement par Sammons Creative. L'utilisateur final est seul responsable de vérifier l'exactitude, les erreurs, l'orthographe, les dates et la conformité légale (y compris les exigences relatives aux licences de tirage) de tout le contenu de la bannière avant impression ou publication. Sammons Creative n'assume aucune responsabilité pour les erreurs ou omissions dans le résultat généré. Aucune information ni image saisie dans cet outil n'est stockée, enregistrée ou transmise à un serveur.`,
  },
};

function renderInstructionsDoc(lang) {
  // internal — called from openInstructions above; not exported.
  const S = INSTRUCTIONS_STRINGS[lang];
  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html>
<html lang="${S.htmlLang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${S.title}</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>${INSTRUCTIONS_CSS}</style>
</head>
<body>
<div class="page">
  <div class="doc-header">
    <div class="doc-title">
      <h1>${S.h1}</h1>
      <p>${S.subtitle}</p>
    </div>
    <span class="doc-badge">✦ Promo Builder</span>
  </div>
  <div class="intro">${S.intro}</div>
  <div class="steps-grid">
    <div class="step">
      <div class="step-head"><div class="step-num">1</div><span class="step-label">${S.step1Label}</span></div>
      <div class="step-body">${S.step1Body}</div>
    </div>
    <div class="step">
      <div class="step-head"><div class="step-num">2</div><span class="step-label">${S.step2Label}</span></div>
      <div class="step-body">${S.step2Body}</div>
    </div>
    <div class="step full">
      <div class="step-head"><div class="step-num">3</div><span class="step-label">${S.step3Label}</span></div>
      <div class="step-body">${S.step3Body}</div>
    </div>
  </div>
  <div class="tips-row">
    <div class="tip">
      <span class="tip-icon">🖼️</span>
      <h4>${S.tipImgH4}</h4>
      <p>${S.tipImgP}</p>
    </div>
  </div>
  <div class="tips-row" style="margin-top:0;">
    <div class="tip" style="border-left:4px solid #d97706;background:#fffbeb;">
      <span class="tip-icon">⚠️</span>
      <h4 style="color:#92400e;">${S.tipCheckerH4}</h4>
      <p style="margin-bottom:10px;">${S.tipCheckerP1}</p>
      <div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap;margin-bottom:12px;">
        <div style="text-align:center;">
          <svg width="120" height="120" viewBox="0 0 120 120" style="display:block;border-radius:6px;border:1px solid #ddd;margin-bottom:4px;">
            <defs><pattern id="cb-${lang}" width="20" height="20" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="#ccc"/><rect x="10" width="10" height="10" fill="#fff"/><rect y="10" width="10" height="10" fill="#fff"/><rect x="10" y="10" width="10" height="10" fill="#ccc"/></pattern></defs>
            <rect width="120" height="120" fill="url(#cb-${lang})"/>
            <circle cx="60" cy="52" r="30" fill="white" stroke="#eee" stroke-width="0.5"/>
            <rect x="38" y="80" rx="3" width="44" height="10" fill="white" stroke="#eee" stroke-width="0.5"/>
          </svg>
          <span style="font-size:0.62rem;color:#92400e;font-weight:600;">${S.tipCheckerBadLabel}</span>
        </div>
        <div style="text-align:center;">
          <svg width="120" height="120" viewBox="0 0 120 120" style="display:block;border-radius:6px;border:1px solid #ddd;margin-bottom:4px;">
            <defs><pattern id="cb2-${lang}" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#f0f0f0"/><rect x="8" width="8" height="8" fill="#fff"/><rect y="8" width="8" height="8" fill="#fff"/><rect x="8" y="8" width="8" height="8" fill="#f0f0f0"/></pattern></defs>
            <rect width="120" height="120" fill="url(#cb2-${lang})"/>
            <circle cx="60" cy="52" r="30" fill="#2563eb"/>
            <rect x="38" y="80" rx="3" width="44" height="10" fill="#2563eb"/>
          </svg>
          <span style="font-size:0.62rem;color:#16a34a;font-weight:600;">${S.tipCheckerGoodLabel}</span>
        </div>
      </div>
      <p style="margin:0;font-size:0.78rem;">${S.tipCheckerP2}</p>
    </div>
  </div>
  <div class="dl-section">
    <div class="dl-icon">⬇️</div>
    <div>
      <h3>${S.dlH3}</h3>
      <p>${S.dlP}</p>
    </div>
  </div>
  <div class="disclaimer">
    <p>${S.disclaimer}</p>
  </div>
</div>
</body>
</html>`);
  w.document.close();
}
