// Entry point for the Instructions button. Takes the current app language
// (rather than reading a global) so this module has no cross-module
// dependencies — main.js passes currentLang through when calling.
export function openInstructions(lang) {
  const l = (lang === 'fr' || lang === 'es') ? lang : 'en';
  renderInstructionsDoc(l);
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
  .tag.violet{ background:#fdf4ff; color:#7c3aed; border-color:#e9d5ff; }
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
// identical between languages; only the copy varies. The step numbering
// matches the on-screen order of the left panel: 1 Language, 2 Promo
// Details, 3 Banner Type, 4 Output Format.
const INSTRUCTIONS_STRINGS = {
  en: {
    htmlLang: 'en',
    title: 'Promo Builder — Instructions for Use',
    h1: 'Promo Builder',
    subtitle: `Instructions for Use &nbsp;·&nbsp; by Sammons Creative`,
    intro: `The <strong>Promo Builder</strong> lets you create professional, digital and print-ready promotional banners in seconds — no design experience required. Follow the four steps on the left panel, then generate and download your banner. <strong>Nothing you enter is ever stored or uploaded</strong> — all processing happens in your browser.`,
    step1Label: 'Select Language',
    step1Body: `
      <p>Two dropdowns at the top of the panel:</p>
      <p><strong>Language</strong> — <em>English</em>, <em>Français</em>, or <em>Español</em>. Changing it switches every label, banner text, and dialog in the tool to that language.</p>
      <p><strong>Promo Type</strong> — three options, always in the language you picked above:</p>
      <p>&nbsp;&nbsp;<span class="tag green">50/50 Raffle</span> — winner takes 50% of ticket sales up to a maximum prize.</p>
      <p>&nbsp;&nbsp;<span class="tag gold">Prize Raffle</span> — a fixed item or cash prize is awarded.</p>
      <p>&nbsp;&nbsp;<span class="tag violet">Custom Text</span> — you provide your own headline and subheading, so the tool can be used for any marketing purpose (sales, events, announcements, etc.) — not just raffles.</p>`,
    step2Label: 'Promo Details',
    step2Body: `
      <p style="margin-bottom:8px;">Fill in the fields below to build your banner content. All fields are optional — only what you enter will appear on the banner.</p>
      <table class="field-table">
        <thead><tr><th style="width:30%">Field</th><th>What to Enter</th></tr></thead>
        <tbody>
          <tr><td class="field-name">Organization Name</td><td>Your team, club, or group name (e.g. <em>Northside Hockey Association</em>). Appears prominently on the banner.</td></tr>
          <tr><td class="field-name">Team / Club Logo</td><td>Upload a PNG, JPG, or GIF. For best results use a high-resolution file with a <strong>transparent</strong> or white background. <span style="color:#b45309;font-weight:600;">⚠️ Do not use images with a baked-in checkerboard pattern</span> (see Image Tips below). When a logo is uploaded, the tool extracts a brand palette from it — click any swatch to fine-tune. When no logo is uploaded, use the two colour pickers to set your banner colours manually.</td></tr>
          <tr><td class="field-name">Main Headline &amp; Subheading <span class="tag violet" style="font-size:6.5pt">Custom Text only</span></td><td>Shown only when <em>Custom Text</em> is selected as the Promo Type. Type the two lines you want on the banner (e.g. <em>FALL SALE</em> / <em>50% OFF</em>). The subheading is optional.</td></tr>
          <tr><td class="field-name">Prize Image <span class="tag gold" style="font-size:6.5pt">Prize Raffle only</span></td><td>Optional photo of the prize. Appears only when <em>Prize Raffle</em> (or its French/Spanish equivalent) is selected.</td></tr>
          <tr><td class="field-name">Ticket Purchase URL</td><td>Paste a link to your online ticket sales page. The tool auto-generates a <strong>QR code</strong> and places it in the corner of the banner.</td></tr>
          <tr><td class="field-name">Include Detailed Info <span class="tag" style="font-size:6.5pt">Toggle</span></td><td>Toggle to reveal extra fields: Ticket Packages, Total Tickets Available, Maximum Possible Sales, Prize Description, Licence Number, Draw Date, Draw Time, Draw Location. Use only for jurisdictions that require disclosure — the warning notice below the toggle explains when. <strong>Note:</strong> when this toggle is on, the detailed information takes over the banner's shape and supersedes any prize image. <strong>Hidden entirely</strong> when Custom Text is selected as the Promo Type.</td></tr>
        </tbody>
      </table>`,
    step3Label: 'Banner Type',
    step3Body: `
      <p>Choose the style of banner you want to create:</p>
      <p><strong>Standard <span class="tag">🎟️</span></strong> — A clean, versatile design suitable for any promo or fundraiser.</p>
      <p><strong>Sport <span class="tag">🏆</span></strong> — Adds a sport-themed graphic element (puck, ball, etc.) to the centre of the banner. After selecting Sport, choose your sport from the icon grid that appears below.</p>
      <p style="margin-top:6px;font-size:7.5pt;color:var(--gray-400);">Available sports: Hockey, Soccer, Football, Baseball, Softball, Basketball, Water Polo, Volleyball, Ringette, Curling, Gymnastics, Golf, Figure Skating, Lacrosse, Rugby, Tennis, Swimming, AFL, Wrestling/MMA, Equestrian, Ultimate Frisbee, Fencing, Dance, Boxing, and Track &amp; Field.</p>`,
    step4Label: 'Output Format',
    step4Body: `
      <p>Select the <strong>aspect ratio</strong> that matches where you plan to use the banner:</p>
      <table class="field-table">
        <thead><tr><th>Ratio</th><th>Best For</th></tr></thead>
        <tbody>
          <tr><td class="field-name">16:9</td><td>Facebook cover, widescreen banners, presentation slides — <em>default</em></td></tr>
          <tr><td class="field-name">1:1</td><td>Square social posts (Instagram feed)</td></tr>
          <tr><td class="field-name">4:5</td><td>Instagram portrait posts</td></tr>
          <tr><td class="field-name">9:16</td><td>Instagram/Facebook Stories, Reels, TikTok</td></tr>
          <tr><td class="field-name">1.91:1</td><td>Facebook &amp; LinkedIn ads</td></tr>
          <tr><td class="field-name">Letter <span class="tag gold">Print</span></td><td>Physical print poster — 8.5 × 11 in at 300 DPI. Renders with a 1/2-inch white border so it prints safely on any home or office printer. When a QR Code is included, two QR Codes appear — one in each lower corner for easy wall-mounted viewing.</td></tr>
          <tr><td class="field-name">Custom</td><td>Enter any width × height in pixels for other placements.</td></tr>
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
    dlP: `Once you are satisfied with the preview, click the blue <strong>Generate Banner</strong> button at the bottom of the left panel. The banner will render in full resolution in the right panel. Click <strong>Download PNG</strong> to save the image to your device. The file is named automatically using your organization name, sport (if selected), and aspect ratio. Your downloaded PNG is also <strong>re-uploadable</strong> — see <em>Editing a Banner Later</em> below.`,
    resetH4: 'Reset All Fields',
    resetP: `Below the Generate Banner button is a <strong>Reset All Fields</strong> button. Clicking it prompts you to confirm before wiping everything — form fields, uploaded logo, palette, promo type, language, everything back to defaults. Use this when starting a completely different banner rather than editing your current one. The confirmation dialog protects against accidental clicks.`,
    reuseH4: 'Editing a Banner Later — Re-upload Your PNG',
    reuseP: `Every banner you download from this tool includes an invisible copy of the form data used to build it — every field, your uploaded logo, and your prize image (if any). If you need to change something later (for example, swapping <em>#:Pending</em> for your approved licence number, fixing a typo, or updating the draw date), you don't need to re-enter anything.
      <br><br>At the top of the left panel, use <strong>Continuing an earlier banner? — Upload PNG</strong> and select the PNG you originally downloaded. Every field, image, colour, and toggle is restored exactly as it was. Make your edits and re-generate.
      <br><br><strong>Important:</strong> the embedded data only survives if the PNG file is passed around as-is (email, cloud storage, file transfer). If someone opens the file in Photoshop, Preview, Paint, or a social media platform and re-saves or re-exports it, the data is stripped. Always keep the <em>original</em> download available if you might need to edit later.`,
    disclaimer: `<strong>Disclaimer:</strong> This is a free tool provided by Sammons Creative at no charge. The end user is solely responsible for reviewing all banner content for accuracy, errors, spelling, dates, and legal compliance (including raffle licence requirements) before printing or publishing. Sammons Creative assumes no liability for mistakes or omissions in the generated output. No information or images entered into this tool are stored, saved, or transmitted to any server.`,
  },
  fr: {
    htmlLang: 'fr',
    title: `Générateur de bannières — Guide d'utilisation`,
    h1: 'Générateur de bannières promo',
    subtitle: `Guide d'utilisation &nbsp;·&nbsp; par Sammons Creative`,
    intro: `Le <strong>Générateur de bannières promo</strong> vous permet de créer des bannières promotionnelles professionnelles — prêtes pour le numérique et l'impression — en quelques secondes, sans aucune expérience en conception graphique. Suivez les quatre étapes du panneau de gauche, puis générez et téléchargez votre bannière. <strong>Aucune information que vous saisissez n'est jamais stockée ni téléversée</strong> — tout le traitement se fait dans votre navigateur.`,
    step1Label: 'Choisir la langue',
    step1Body: `
      <p>Deux menus déroulants en haut du panneau :</p>
      <p><strong>Langue</strong> — <em>English</em>, <em>Français</em> ou <em>Español</em>. Changer la langue bascule toutes les étiquettes, textes de bannière et messages de l'outil dans cette langue.</p>
      <p><strong>Type de promo</strong> — trois options, toujours dans la langue choisie ci-dessus :</p>
      <p>&nbsp;&nbsp;<span class="tag green">Tirage moitié-moitié</span> — le gagnant reçoit 50 % des ventes de billets jusqu'à un prix maximum.</p>
      <p>&nbsp;&nbsp;<span class="tag gold">Tirage de Prix</span> — un article ou un montant en argent fixe est attribué.</p>
      <p>&nbsp;&nbsp;<span class="tag violet">Personnalisé</span> — vous fournissez votre propre titre et sous-titre, ce qui permet d'utiliser l'outil pour tout usage marketing (soldes, événements, annonces, etc.) — pas seulement les tirages.</p>`,
    step2Label: 'Détails de la promo',
    step2Body: `
      <p style="margin-bottom:8px;">Remplissez les champs ci-dessous pour construire le contenu de votre bannière. Tous les champs sont facultatifs — seul ce que vous saisissez apparaîtra sur la bannière.</p>
      <table class="field-table">
        <thead><tr><th style="width:32%">Champ</th><th>Quoi saisir</th></tr></thead>
        <tbody>
          <tr><td class="field-name">Nom de l'organisme</td><td>Le nom de votre équipe, club ou groupe (ex. : <em>Association de hockey Northside</em>). Apparaît en évidence sur la bannière.</td></tr>
          <tr><td class="field-name">Logo de l'équipe / club</td><td>Téléversez un PNG, JPG ou GIF. Pour de meilleurs résultats, utilisez un fichier haute résolution avec un fond <strong>transparent</strong> ou blanc. <span style="color:#b45309;font-weight:600;">⚠️ N'utilisez pas d'images avec un fond en damier intégré</span>. Lorsqu'un logo est téléversé, l'outil en extrait une palette de marque — cliquez sur n'importe quelle pastille pour ajuster. Sans logo, utilisez les deux sélecteurs de couleur pour définir manuellement les couleurs de la bannière.</td></tr>
          <tr><td class="field-name">Titre principal et sous-titre <span class="tag violet" style="font-size:6.5pt">Personnalisé seul.</span></td><td>Affichés uniquement lorsque <em>Personnalisé</em> est sélectionné comme type de promo. Saisissez les deux lignes que vous souhaitez sur la bannière (ex. : <em>SOLDE D'AUTOMNE</em> / <em>50 % DE RABAIS</em>). Le sous-titre est facultatif.</p></td></tr>
          <tr><td class="field-name">Image du prix <span class="tag gold" style="font-size:6.5pt">Tirage de Prix seul.</span></td><td>Photo optionnelle du prix. Apparaît uniquement lorsque <em>Tirage de Prix</em> est sélectionné.</td></tr>
          <tr><td class="field-name">URL d'achat de billets</td><td>Collez un lien vers votre page de vente en ligne. L'outil générera automatiquement un <strong>code QR</strong> et le placera dans le coin de la bannière.</td></tr>
          <tr><td class="field-name">Inclure les informations détaillées <span class="tag" style="font-size:6.5pt">Bouton</span></td><td>Activez pour afficher les champs supplémentaires : Forfaits de billets, Total de billets, Ventes maximales, Description du prix, Numéro de licence, Date/heure du tirage et Lieu du tirage. Utilisez uniquement pour les juridictions qui exigent une divulgation — l'avertissement sous le bouton l'explique. <strong>Remarque :</strong> lorsque ce bouton est activé, les informations détaillées occupent la forme de la bannière et remplacent toute image du prix. <strong>Complètement masqué</strong> lorsque Personnalisé est sélectionné comme type de promo.</td></tr>
        </tbody>
      </table>`,
    step3Label: 'Type de bannière',
    step3Body: `
      <p>Choisissez le style de bannière que vous souhaitez créer :</p>
      <p><strong>Standard <span class="tag">🎟️</span></strong> — Un design épuré et polyvalent, adapté à toute promo ou collecte de fonds.</p>
      <p><strong>Sport <span class="tag">🏆</span></strong> — Ajoute un élément graphique thématique (rondelle, ballon, etc.) au centre de la bannière. Après avoir sélectionné Sport, choisissez votre sport dans la grille d'icônes qui apparaît.</p>
      <p style="margin-top:6px;font-size:7.5pt;color:var(--gray-400);">Sports disponibles : Hockey, Soccer, Football, Baseball, Softball, Basketball, Water-polo, Volleyball, Ringette, Curling, Gymnastique, Golf, Patinage artistique, Crosse, Rugby, Tennis, Natation, AFL, Lutte/AMM, Équitation, Frisbee ultime, Escrime, Danse, Boxe et Athlétisme.</p>`,
    step4Label: 'Format de sortie',
    step4Body: `
      <p>Sélectionnez le <strong>format d'image</strong> qui correspond à l'utilisation prévue de la bannière :</p>
      <table class="field-table">
        <thead><tr><th>Format</th><th>Idéal pour</th></tr></thead>
        <tbody>
          <tr><td class="field-name">16:9</td><td>Couverture Facebook, bannières écran large, diaporamas — <em>par défaut</em></td></tr>
          <tr><td class="field-name">1:1</td><td>Publications carrées sur les réseaux sociaux (Instagram)</td></tr>
          <tr><td class="field-name">4:5</td><td>Publications portrait sur Instagram</td></tr>
          <tr><td class="field-name">9:16</td><td>Stories Instagram/Facebook, Reels, TikTok</td></tr>
          <tr><td class="field-name">1.91:1</td><td>Pubs Facebook et LinkedIn</td></tr>
          <tr><td class="field-name">Letter <span class="tag gold">Impression</span></td><td>Affiche imprimée — 8,5 × 11 po à 300 DPI. Générée avec une bordure blanche de 1/2 po. Avec un code QR, deux codes apparaissent — un dans chaque coin inférieur.</td></tr>
          <tr><td class="field-name">Personnalisé</td><td>Entrez toute largeur × hauteur en pixels pour d'autres emplacements.</td></tr>
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
    dlP: `Lorsque vous êtes satisfait de l'aperçu, cliquez sur le bouton bleu <strong>Générer la bannière</strong> en bas du panneau de gauche. La bannière s'affichera en pleine résolution dans le panneau de droite. Cliquez sur <strong>Télécharger PNG</strong> pour enregistrer l'image sur votre appareil. Le fichier est nommé automatiquement selon le nom de votre organisme, le sport (si sélectionné) et le format d'image. Le PNG téléchargé est également <strong>réimportable</strong> — voir <em>Modifier une bannière plus tard</em> ci-dessous.`,
    resetH4: 'Tout réinitialiser',
    resetP: `Sous le bouton Générer la bannière se trouve un bouton <strong>Tout réinitialiser</strong>. Un clic ouvre un dialogue de confirmation avant de tout effacer — champs, logo, palette, type de promo, langue, tout revient aux valeurs par défaut. Utilisez-le pour recommencer une bannière complètement différente plutôt que pour modifier la bannière actuelle. Le dialogue vous protège contre les clics accidentels.`,
    reuseH4: 'Modifier une bannière plus tard — Réimporter votre PNG',
    reuseP: `Chaque bannière téléchargée depuis cet outil contient une copie invisible des données du formulaire ayant servi à la créer — chaque champ, votre logo téléversé, et l'image du prix (le cas échéant). Si vous devez modifier un détail plus tard (par exemple, remplacer <em>#:En attente</em> par votre numéro de licence approuvé, corriger une faute de frappe ou mettre à jour la date du tirage), il n'est pas nécessaire de tout ressaisir.
      <br><br>En haut du panneau de gauche, utilisez <strong>Vous continuez une bannière précédente ? — Téléverser un PNG</strong> et sélectionnez le PNG que vous aviez téléchargé. Chaque champ, image, couleur et bouton sera restauré exactement comme auparavant. Faites vos modifications et régénérez.
      <br><br><strong>Important :</strong> les données intégrées ne survivent que si le fichier PNG est transmis tel quel (courriel, stockage infonuagique, transfert de fichiers). Si quelqu'un ouvre le fichier dans Photoshop, Aperçu, Paint ou sur une plateforme de médias sociaux et le réenregistre ou le réexporte, les données sont supprimées. Conservez toujours le fichier <em>original</em> téléchargé si vous prévoyez le modifier plus tard.`,
    disclaimer: `<strong>Avis de non-responsabilité :</strong> Cet outil est fourni gratuitement par Sammons Creative. L'utilisateur final est seul responsable de vérifier l'exactitude, les erreurs, l'orthographe, les dates et la conformité légale (y compris les exigences relatives aux licences de tirage) de tout le contenu de la bannière avant impression ou publication. Sammons Creative n'assume aucune responsabilité pour les erreurs ou omissions dans le résultat généré. Aucune information ni image saisie dans cet outil n'est stockée, enregistrée ou transmise à un serveur.`,
  },
  es: {
    htmlLang: 'es',
    title: 'Promo Builder — Guía de uso',
    h1: 'Promo Builder',
    subtitle: `Guía de uso &nbsp;·&nbsp; por Sammons Creative`,
    intro: `El <strong>Promo Builder</strong> le permite crear en segundos banderas promocionales profesionales —digitales y listas para imprimir— sin experiencia en diseño. Siga los cuatro pasos del panel izquierdo, luego genere y descargue su bandera. <strong>Nada de lo que ingresa se almacena ni se sube a un servidor</strong> — todo el procesamiento ocurre en su navegador.`,
    step1Label: 'Elegir el idioma',
    step1Body: `
      <p>Dos menús desplegables en la parte superior del panel:</p>
      <p><strong>Idioma</strong> — <em>English</em>, <em>Français</em> o <em>Español</em>. Cambiarlo alterna todas las etiquetas, textos de bandera y diálogos de la herramienta a ese idioma.</p>
      <p><strong>Tipo de promo</strong> — tres opciones, siempre en el idioma que eligió arriba:</p>
      <p>&nbsp;&nbsp;<span class="tag green">Rifa 50/50</span> — el ganador recibe el 50 % de las ventas de boletos hasta un premio máximo.</p>
      <p>&nbsp;&nbsp;<span class="tag gold">Rifa con Premio</span> — se otorga un artículo o premio en efectivo fijo.</p>
      <p>&nbsp;&nbsp;<span class="tag violet">Personalizado</span> — usted proporciona su propio titular y subtítulo, para que la herramienta se pueda usar con cualquier fin de marketing (ofertas, eventos, anuncios, etc.) — no solo rifas.</p>`,
    step2Label: 'Detalles de la promo',
    step2Body: `
      <p style="margin-bottom:8px;">Llene los campos a continuación para construir el contenido de su bandera. Todos los campos son opcionales — solo aparecerá lo que usted ingrese.</p>
      <table class="field-table">
        <thead><tr><th style="width:30%">Campo</th><th>Qué ingresar</th></tr></thead>
        <tbody>
          <tr><td class="field-name">Nombre de la organización</td><td>El nombre de su equipo, club o grupo (ej.: <em>Asociación de Hockey Northside</em>). Aparece de forma destacada en la bandera.</td></tr>
          <tr><td class="field-name">Logo del equipo / club</td><td>Suba un PNG, JPG o GIF. Para mejores resultados, use un archivo de alta resolución con fondo <strong>transparente</strong> o blanco. <span style="color:#b45309;font-weight:600;">⚠️ No use imágenes con un patrón de damero integrado</span>. Cuando sube un logo, la herramienta extrae una paleta de marca — haga clic en cualquier muestra para ajustar. Sin logo, use los dos selectores de color para definir manualmente los colores de la bandera.</td></tr>
          <tr><td class="field-name">Titular principal y subtítulo <span class="tag violet" style="font-size:6.5pt">Solo Personalizado</span></td><td>Se muestran solo cuando <em>Personalizado</em> está seleccionado como tipo de promo. Escriba las dos líneas que quiere en la bandera (ej.: <em>OFERTA DE OTOÑO</em> / <em>50% DE DESCUENTO</em>). El subtítulo es opcional.</td></tr>
          <tr><td class="field-name">Imagen del premio <span class="tag gold" style="font-size:6.5pt">Solo Rifa con Premio</span></td><td>Foto opcional del premio. Aparece solo cuando se selecciona <em>Rifa con Premio</em>.</td></tr>
          <tr><td class="field-name">URL de compra de boletos</td><td>Pegue un enlace a su página en línea de venta de boletos. La herramienta generará automáticamente un <strong>código QR</strong> y lo colocará en la esquina de la bandera.</td></tr>
          <tr><td class="field-name">Incluir información detallada <span class="tag" style="font-size:6.5pt">Interruptor</span></td><td>Actívelo para revelar campos adicionales: Paquetes de boletos, Total de boletos, Ventas máximas, Descripción del premio, Número de licencia, Fecha/hora del sorteo y Lugar del sorteo. Úselo solo en jurisdicciones que exijan divulgación — el aviso debajo del interruptor lo explica. <strong>Nota:</strong> al activar este interruptor, la información detallada ocupa la forma de la bandera y reemplaza cualquier imagen del premio. <strong>Completamente oculto</strong> cuando Personalizado está seleccionado como tipo de promo.</td></tr>
        </tbody>
      </table>`,
    step3Label: 'Tipo de bandera',
    step3Body: `
      <p>Elija el estilo de bandera que desea crear:</p>
      <p><strong>Estándar <span class="tag">🎟️</span></strong> — Un diseño limpio y versátil, adecuado para cualquier promo o recaudación de fondos.</p>
      <p><strong>Deporte <span class="tag">🏆</span></strong> — Añade un elemento gráfico temático (puck, balón, etc.) al centro de la bandera. Después de seleccionar Deporte, elija su disciplina en la cuadrícula de íconos que aparece a continuación.</p>
      <p style="margin-top:6px;font-size:7.5pt;color:var(--gray-400);">Deportes disponibles: Hockey, Fútbol, Fútbol americano, Béisbol, Sóftbol, Baloncesto, Waterpolo, Voleibol, Ringette, Curling, Gimnasia, Golf, Patinaje artístico, Lacrosse, Rugby, Tenis, Natación, AFL, Lucha/AMM, Ecuestre, Ultimate, Esgrima, Baile, Boxeo y Atletismo.</p>`,
    step4Label: 'Formato de salida',
    step4Body: `
      <p>Seleccione la <strong>proporción</strong> que corresponda al lugar donde usará la bandera:</p>
      <table class="field-table">
        <thead><tr><th>Proporción</th><th>Ideal para</th></tr></thead>
        <tbody>
          <tr><td class="field-name">16:9</td><td>Portada de Facebook, banners de pantalla ancha, diapositivas — <em>predeterminado</em></td></tr>
          <tr><td class="field-name">1:1</td><td>Publicaciones cuadradas en redes (Instagram)</td></tr>
          <tr><td class="field-name">4:5</td><td>Publicaciones verticales en Instagram</td></tr>
          <tr><td class="field-name">9:16</td><td>Stories de Instagram/Facebook, Reels, TikTok</td></tr>
          <tr><td class="field-name">1.91:1</td><td>Anuncios de Facebook y LinkedIn</td></tr>
          <tr><td class="field-name">Letter <span class="tag gold">Imprimir</span></td><td>Cartel para imprimir — 8.5 × 11 pulgadas a 300 DPI. Se genera con un margen blanco de 1/2 pulgada. Con Código QR, aparecen dos códigos — uno en cada esquina inferior.</td></tr>
          <tr><td class="field-name">Personalizado</td><td>Ingrese cualquier ancho × alto en píxeles para otros usos.</td></tr>
        </tbody>
      </table>`,
    tipImgH4: 'Consejos de imagen',
    tipImgP: 'Use logos de alta resolución (al menos 500 × 500 px). Los archivos PNG con fondo transparente producen los resultados más limpios en la bandera.',
    tipCheckerH4: 'Evite fondos con damero "integrado"',
    tipCheckerP1: `Algunas imágenes tienen un <strong>patrón de damero gris y blanco</strong> incrustado directamente en los píxeles. Este patrón lo usan los editores de imagen (Photoshop, GIMP, etc.) para <em>representar</em> la transparencia — pero si la imagen se guardó incorrectamente (por ej. como JPG, o como PNG sin canal alfa), el damero se vuelve permanente y <strong>no se puede eliminar</strong> con esta herramienta.`,
    tipCheckerBadLabel: '&#10060; MALO — Damero integrado',
    tipCheckerGoodLabel: '&#9989; BUENO — Transparencia real (PNG)',
    tipCheckerP2: `<strong>Cómo corregirlo:</strong> Abra el archivo original en un editor de imagen, asegúrese de que el fondo sea verdaderamente transparente (debe ver el damero en el editor pero <em>no</em> debe formar parte del archivo guardado), luego expórtelo como <strong>PNG con transparencia</strong> activada. Vuelva a subir el archivo corregido.`,
    dlH3: 'Generar y descargar su bandera',
    dlP: `Cuando esté satisfecho con la vista previa, haga clic en el botón azul <strong>Generar bandera</strong> al pie del panel izquierdo. La bandera se generará en resolución completa en el panel derecho. Haga clic en <strong>Descargar PNG</strong> para guardar la imagen en su dispositivo. El archivo se nombra automáticamente con el nombre de su organización, el deporte (si se seleccionó) y la proporción. Su PNG descargado también es <strong>reeditable</strong> — vea <em>Editar una bandera después</em> a continuación.`,
    resetH4: 'Restablecer todo',
    resetP: `Debajo del botón Generar bandera hay un botón <strong>Restablecer todo</strong>. Al hacer clic, aparece un diálogo de confirmación antes de borrar todo — campos, logo, paleta, tipo de promo, idioma, todo vuelve a los valores predeterminados. Úselo cuando quiera empezar una bandera completamente distinta en lugar de editar la actual. El diálogo lo protege contra clics accidentales.`,
    reuseH4: 'Editar una bandera después — Vuelva a subir su PNG',
    reuseP: `Cada bandera que descarga de esta herramienta incluye una copia invisible de los datos del formulario usados para construirla — cada campo, su logo subido y la imagen del premio (si aplica). Si necesita cambiar algo después (por ejemplo, reemplazar <em>#:Pendiente</em> por su número de licencia aprobado, corregir un error tipográfico o actualizar la fecha del sorteo), no necesita volver a ingresar nada.
      <br><br>En la parte superior del panel izquierdo, use <strong>¿Continuando una bandera anterior? — Subir PNG</strong> y seleccione el PNG que descargó originalmente. Cada campo, imagen, color e interruptor se restaura exactamente como estaba. Haga sus cambios y vuelva a generar.
      <br><br><strong>Importante:</strong> los datos integrados solo sobreviven si el archivo PNG se transmite tal cual (correo, almacenamiento en la nube, transferencia de archivos). Si alguien abre el archivo en Photoshop, Preview, Paint o una plataforma de redes sociales y lo vuelve a guardar o exportar, los datos se eliminan. Conserve siempre el archivo <em>original</em> descargado si podría necesitar editarlo después.`,
    disclaimer: `<strong>Aviso legal:</strong> Esta es una herramienta gratuita proporcionada por Sammons Creative sin costo. El usuario final es el único responsable de revisar todo el contenido de la bandera para verificar exactitud, errores, ortografía, fechas y cumplimiento legal (incluidos los requisitos de licencia de rifa) antes de imprimir o publicar. Sammons Creative no asume responsabilidad por errores u omisiones en el resultado generado. Ninguna información o imagen ingresada en esta herramienta se almacena, guarda ni se transmite a ningún servidor.`,
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
    <div class="step full">
      <div class="step-head"><div class="step-num">1</div><span class="step-label">${S.step1Label}</span></div>
      <div class="step-body">${S.step1Body}</div>
    </div>
    <div class="step full">
      <div class="step-head"><div class="step-num">2</div><span class="step-label">${S.step2Label}</span></div>
      <div class="step-body">${S.step2Body}</div>
    </div>
    <div class="step">
      <div class="step-head"><div class="step-num">3</div><span class="step-label">${S.step3Label}</span></div>
      <div class="step-body">${S.step3Body}</div>
    </div>
    <div class="step">
      <div class="step-head"><div class="step-num">4</div><span class="step-label">${S.step4Label}</span></div>
      <div class="step-body">${S.step4Body}</div>
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
  <div class="dl-section" style="background:linear-gradient(135deg,#fef2f2 0%,#fff1f2 100%);border-color:#fecaca;">
    <div class="dl-icon">↺</div>
    <div>
      <h3>${S.resetH4}</h3>
      <p>${S.resetP}</p>
    </div>
  </div>
  <div class="dl-section" style="background:linear-gradient(135deg,#fef3c7 0%,#fef9c3 100%);border-color:#fde68a;">
    <div class="dl-icon">↻</div>
    <div>
      <h3>${S.reuseH4}</h3>
      <p>${S.reuseP}</p>
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
