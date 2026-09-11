export interface CustomInfoField {
  label: string;
  value: string;
}

export interface TexSettings {
  name: string;
  title: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  github: string;
  portfolio: string;
  accentColor: string; // e.g. "1F3A5F"
  margin: string; // e.g. "0.55in"
  showPhoto: boolean;
  photoUrl: string;
  useIcons: boolean;
  customFields: CustomInfoField[];
}

export const DEFAULT_TEX_SETTINGS: TexSettings = {
  name: "Alex Johnson",
  title: "Senior Full-Stack Engineer",
  email: "alex@example.com",
  phone: "+1 (555) 234-5678",
  location: "San Francisco, CA",
  linkedin: "linkedin.com/in/alexjohnson",
  github: "github.com/alexjohnson",
  portfolio: "alexjohnson.dev",
  accentColor: "1F3A5F",
  margin: "0.55in",
  showPhoto: false,
  photoUrl: "photo.png",
  useIcons: false,
  customFields: [],
};

/**
 * Parses current visual settings from a .tex document buffer.
 */
export function parseTexSettings(tex: string): TexSettings {
  const s: TexSettings = { ...DEFAULT_TEX_SETTINGS, customFields: [] };
  if (!tex || !tex.trim()) return s;

  // 1. Accent color
  const colorMatch = tex.match(/\\definecolor\{accent\}\{HTML\}\{([A-Fa-f0-9]{6})\}/i);
  if (colorMatch) s.accentColor = colorMatch[1].toUpperCase();

  // 2. Margin
  const marginMatch = tex.match(/margin=([0-9.]+(?:in|cm|mm|pt))/i);
  if (marginMatch) s.margin = marginMatch[1];

  // 3. Photo detection
  s.showPhoto = /\\includegraphics|photo\.png|photo\.jpg|avatar/i.test(tex) && /\\begin\{minipage\}/i.test(tex);
  const photoSourceComment = tex.match(/%\s*HUNTFLOW_PHOTO_SOURCE:\s*([^\s\n]+)/i);
  if (photoSourceComment) {
    s.photoUrl = photoSourceComment[1].trim();
  } else {
    const photoUrlMatch = tex.match(/\\includegraphics\[[^\]]*\]\{([^}]+)\}/i);
    if (photoUrlMatch) s.photoUrl = photoUrlMatch[1].trim();
  }
  // 4. Icons detection
  s.useIcons = /\\fa(?:Envelope|Phone|MapMarker|Linkedin|Github)/i.test(tex) || /fontawesome/i.test(tex);

  // 5. Name
  const nameMatch =
    tex.match(/\{\\LARGE\\bfseries\\color\{ink\}\s*([^\}\n]+)\}/i) ||
    tex.match(/\\textbf\{\\LARGE\s*([^\}\n]+)\}/i) ||
    tex.match(/\{\\Huge\\bfseries\s*([^\}\n]+)\}/i);
  if (nameMatch) s.name = nameMatch[1].trim();

  // 6. Title
  const titleMatch =
    tex.match(/\{\\large\\color\{accent\}\s*([^\}\n]+)\}/i) ||
    tex.match(/\{\\large\\itshape\\color\{accent\}\s*([^\}\n]+)\}/i) ||
    tex.match(/\{\\large\s*([^\}\n]+)\}\\par/i);
  if (titleMatch) s.title = titleMatch[1].trim();

  // 7. Contact parsing
  const emailMatch = tex.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (emailMatch) s.email = emailMatch[1];

  const phoneMatch = tex.match(/(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  if (phoneMatch) s.phone = phoneMatch[0].trim();

  const linkedinMatch = tex.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/([a-zA-Z0-9_-]+)/i);
  if (linkedinMatch) s.linkedin = `linkedin.com/in/${linkedinMatch[1]}`;

  const githubMatch = tex.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_-]+)/i);
  if (githubMatch) s.github = `github.com/${githubMatch[1]}`;

  const portfolioMatch = tex.match(/(?:\\faGlobe\\\s*|(?:\s*\|\s*))([a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\/[a-zA-Z0-9_.~#%&=?-]+)?)/i);
  if (portfolioMatch && !/github\.com|linkedin\.com/i.test(portfolioMatch[1])) {
    s.portfolio = portfolioMatch[1].trim();
  }
  // Custom fields
  const customMatch = tex.match(/\\textbf\{([^}]+)\}:\s*([^\\]+)/g);
  if (customMatch) {
    for (const item of customMatch) {
      const parts = item.match(/\\textbf\{([^}]+)\}:\s*([^\\]+)/);
      if (parts && parts[1] && parts[2]) {
        const label = parts[1].trim();
        const value = parts[2].trim().replace(/\\quad|\|/g, "").trim();
        if (!/Summary|Experience|Projects|Education|Skills/i.test(label)) {
          s.customFields.push({ label, value });
        }
      }
    }
  }

  return s;
}

/**
 * Patches a .tex document buffer with the modified settings.
 */
export function applyTexSettings(tex: string, newSettings: Partial<TexSettings>): string {
  let out = tex;
  if (!out || !out.trim()) return out;

  // 1. Update Accent Color
  if (newSettings.accentColor) {
    const hex = newSettings.accentColor.replace("#", "").toUpperCase();
    if (/\\definecolor\{accent\}\{HTML\}\{[A-Fa-f0-9]{6}\}/i.test(out)) {
      out = out.replace(
        /\\definecolor\{accent\}\{HTML\}\{[A-Fa-f0-9]{6}\}/i,
        `\\definecolor{accent}{HTML}{${hex}}`
      );
    } else {
      out = out.replace(
        /\\pagestyle\{empty\}/i,
        `\\definecolor{accent}{HTML}{${hex}}\n\\pagestyle{empty}`
      );
    }
  }

  // 2. Update Margins
  if (newSettings.margin) {
    const m = newSettings.margin.trim();
    if (/\\geometry\{letterpaper,[^}]+\}/i.test(out)) {
      out = out.replace(
        /\\geometry\{letterpaper,[^}]+\}/i,
        `\\geometry{letterpaper, margin=${m}, top=${m}, bottom=${m}}`
      );
    }
  }

  // 3. Ensure required packages in preamble (graphicx for photo, fontawesome5 for icons)
  if (newSettings.showPhoto && !/\\usepackage\{graphicx\}/i.test(out)) {
    out = out.replace(
      /\\usepackage\{xcolor\}/i,
      "\\usepackage{xcolor}\n\\usepackage{graphicx}"
    );
  }

  if (newSettings.useIcons && !/\\usepackage\{fontawesome5\}/i.test(out)) {
    out = out.replace(
      /\\usepackage\{xcolor\}/i,
      "\\usepackage{xcolor}\n\\usepackage{fontawesome5}"
    );
  }

  // 4. Build Contact Line
  const current = parseTexSettings(out);
  const s: TexSettings = { ...current, ...newSettings };

  const contactItems: string[] = [];
  if (s.email) {
    contactItems.push(s.useIcons ? `\\faEnvelope\\ ${s.email}` : s.email);
  }
  if (s.phone) {
    contactItems.push(s.useIcons ? `\\faPhone\\ ${s.phone}` : s.phone);
  }
  if (s.location) {
    contactItems.push(s.useIcons ? `\\faMapMarker*\\ ${s.location}` : s.location);
  }
  if (s.linkedin) {
    contactItems.push(s.useIcons ? `\\faLinkedin\\ ${s.linkedin}` : s.linkedin);
  }
  if (s.github) {
    contactItems.push(s.useIcons ? `\\faGithub\\ ${s.github}` : s.github);
  }
  if (s.portfolio) {
    contactItems.push(s.useIcons ? `\\faGlobe\\ ${s.portfolio}` : s.portfolio);
  }
  for (const cf of s.customFields || []) {
    if (cf.label && cf.value) {
      contactItems.push(`\\textbf{${cf.label}:} ${cf.value}`);
    }
  }

  const contactLineTex = contactItems.join(s.useIcons ? " \\quad " : " \\quad|\\quad ");

  // 5. Update Header with or without Photo
  const headerName = s.name || "Your Name";
  const headerTitle = s.title ? `{\\large\\color{accent} ${s.title}}\\par` : "";

  if (s.showPhoto) {
    const photoSource = s.photoUrl || "photo.png";
    const photoHeader = `% HUNTFLOW_PHOTO_SOURCE: ${photoSource}
\\noindent
\\begin{minipage}[c]{0.78\\textwidth}
  {\\LARGE\\bfseries\\color{ink} ${headerName}}\\par
  ${headerTitle}
  \\vspace{0.12em}
  {\\small\\color{ink} ${contactLineTex}}
\\end{minipage}\\hfill
\\begin{minipage}[c]{0.20\\textwidth}
  \\raggedleft
  \\includegraphics[width=2.4cm,height=2.4cm,keepaspectratio]{photo.png}
\\end{minipage}
\\vspace{0.35em}`;

    // If there is already a minipage header or photo source comment, replace it
    if (/(?:%\s*HUNTFLOW_PHOTO_SOURCE:[^\n]*\n)?\\noindent\s*\\begin\{minipage\}[\s\S]*?\\end\{minipage\}\s*\\vspace\{[^}]+\}/i.test(out)) {
      out = out.replace(
        /(?:%\s*HUNTFLOW_PHOTO_SOURCE:[^\n]*\n)?\\noindent\s*\\begin\{minipage\}[\s\S]*?\\end\{minipage\}\s*\\vspace\{[^}]+\}/i,
        photoHeader
      );
    } else {
      // Replace standard name/title/contact block
      out = out.replace(
        /\{\\LARGE\\bfseries\\color\{ink\}[^}]+\}\\par[\s\S]*?\{\\small\\color\{ink\}[^}]+\}\s*\\vspace\{[^}]+\}/i,
        photoHeader
      );
    }
  } else {
    // Standard text header without photo
    const standardHeader = `{\\LARGE\\bfseries\\color{ink} ${headerName}}\\par
${headerTitle}
\\vspace{0.12em}
{\\small\\color{ink} ${contactLineTex}}
\\vspace{0.35em}`;

    if (/(?:%\s*HUNTFLOW_PHOTO_SOURCE:[^\n]*\n)?\\noindent\s*\\begin\{minipage\}[\s\S]*?\\end\{minipage\}\s*\\vspace\{[^}]+\}/i.test(out)) {
      out = out.replace(
        /(?:%\s*HUNTFLOW_PHOTO_SOURCE:[^\n]*\n)?\\noindent\s*\\begin\{minipage\}[\s\S]*?\\end\{minipage\}\s*\\vspace\{[^}]+\}/i,
        standardHeader
      );
    } else {
      out = out.replace(
        /\{\\LARGE\\bfseries\\color\{ink\}[^}]+\}\\par[\s\S]*?\{\\small\\color\{ink\}[^}]+\}\s*\\vspace\{[^}]+\}/i,
        standardHeader
      );
    }
  }

  return out;
}
