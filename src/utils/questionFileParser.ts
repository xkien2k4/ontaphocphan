import ExcelJS from 'exceljs';
import mammoth from 'mammoth';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { Question, QuestionType, DifficultyLevel, QuestionOption } from '../types';

let parseTempIdCounter = 0;
function makeTempId(prefix: string): string {
  parseTempIdCounter += 1;
  return `${prefix}_${Date.now()}_${parseTempIdCounter}`;
}

export interface ParsedQuestionDraft {
  tempId: string;
  questionType: QuestionType;
  difficulty: DifficultyLevel;
  content: string;
  codeSnippet?: string;
  sampleSolution?: string;
  aiSolved?: boolean;
  answerDetected?: boolean;
  options: QuestionOption[];
  correctAnswer: string | string[];
  explanation: string;
  points: number;
  chapterId: string;
  warnings?: string[];
}

interface StyledLine {
  text: string;
  isWholeBold?: boolean;
  isWholeUnderline?: boolean;
  isWholeHighlighted?: boolean;
  emphasizedFragments?: string[];
}

function normalizeHeaderKey(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeDifficulty(val: any): DifficultyLevel {
  const s = normalizeHeaderKey(String(val || ''));
  if (s === 'easy' || s === 'de' || s === '1' || s.includes('nhan biet')) return 'easy';
  if (s === 'hard' || s === 'kho' || s === '3' || s.includes('van dung cao')) return 'hard';
  return 'medium';
}

function normalizeQuestionType(val: any, hasOptions: boolean): QuestionType {
  const s = normalizeHeaderKey(String(val || ''));
  if (
    s.includes('thuc hanh') ||
    s.includes('tu luan') ||
    s === 'essay' ||
    s === 'practical' ||
    s === 'code'
  ) {
    return 'essay';
  }
  if (s.includes('nhieu') || s === 'multiple choice' || s === 'multi' || s === 'multiple') {
    return 'multiple_choice';
  }
  if (s.includes('dung sai') || s === 'true false' || s === 'tf') {
    return 'true_false';
  }
  if (s.includes('dien') || s === 'fill blank' || s === 'fill') {
    return 'fill_blank';
  }
  if (s.includes('trac nghiem') || s === 'single choice' || s === 'mcq' || s === 'tn') {
    return 'single_choice';
  }
  return hasOptions ? 'single_choice' : 'essay';
}

function mapAnswerLetterToOptId(letter: string): string {
  const clean = letter.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
  if (clean === 'A' || clean === '1' || clean === 'OPT_1') return 'opt_1';
  if (clean === 'B' || clean === '2' || clean === 'OPT_2') return 'opt_2';
  if (clean === 'C' || clean === '3' || clean === 'OPT_3') return 'opt_3';
  if (clean === 'D' || clean === '4' || clean === 'OPT_4') return 'opt_4';
  return '';
}

function extractAnswerOptIds(rawAns: string, options: QuestionOption[]): string[] {
  const clean = String(rawAns || '').trim();
  if (!clean) return [];

  // 1. Direct letters or numbers: "A", "B.", "(C)", "A, C", "A & D", "1; 3"
  const normalizedLetters = clean
    .replace(/(?:đáp án|dap an|đúng|dung|key|answer|chọn|chon)\s*[:\-]?\s*/gi, '')
    .trim();

  const tokenParts = normalizedLetters
    .split(/[,;|/\s&+\-]+/)
    .map(t => t.replace(/[().[\]:]/g, '').trim())
    .filter(Boolean);

  if (tokenParts.length > 0 && tokenParts.every(t => /^(?:[A-Da-d]|[1-4]|opt_[1-4])$/i.test(t))) {
    const mapped = Array.from(new Set(tokenParts.map(mapAnswerLetterToOptId).filter(Boolean)));
    if (mapped.length > 0) return mapped;
  }

  // Single letter prefix like "B. O(log n)" or "C) Kế thừa"
  const leadingLetterMatch = normalizedLetters.match(/^([A-D])\s*[.):]\s+.+$/i);
  if (leadingLetterMatch) {
    const id = mapAnswerLetterToOptId(leadingLetterMatch[1]);
    if (id) return [id];
  }

  // 2. Match by exact/partial option text
  const lowerClean = normalizedLetters.toLowerCase();
  const exactMatch = options.find(o => o.text.trim().toLowerCase() === lowerClean);
  if (exactMatch) return [exactMatch.id];

  const partialMatch = options.find(
    o => o.text.trim().length >= 3 && (lowerClean.includes(o.text.trim().toLowerCase()) || o.text.trim().toLowerCase().includes(lowerClean))
  );
  if (partialMatch) return [partialMatch.id];

  return [];
}

function cleanMarkedOptionText(raw: string): { text: string; isMarked: boolean } {
  let text = String(raw || '').trim();
  let isMarked = false;

  // Leading markers: "* ...", "✓ ...", "✔ ...", "[x] ...", "(x) ...", "-> ...", "=> ..."
  const leadingMarkerRegex = /^(?:\*+|✓|✔|☑|\[[xX*]\]|\([xX*]\)|->|=>)\s*/;
  if (leadingMarkerRegex.test(text)) {
    isMarked = true;
    text = text.replace(leadingMarkerRegex, '').trim();
  }

  // Trailing markers: "... *", "... (*)", "... [x]", "... (đáp án đúng)", "... (đúng)"
  const trailingMarkerRegex = /\s*(?:\(\s*(?:đáp\s*án\s*(?:đúng)?|đúng|key|\*+)\s*\)|\[\s*(?:đúng|key|x|\*+)\s*\]|\*+|✓|✔)$/i;
  if (trailingMarkerRegex.test(text)) {
    isMarked = true;
    text = text.replace(trailingMarkerRegex, '').trim();
  }

  return { text, isMarked };
}

function pickField(row: Record<string, any>, aliases: string[]): string {
  const keys = Object.keys(row);
  // First pass: exact trimmed lowercase
  for (const alias of aliases) {
    const foundKey = keys.find(k => k.trim().toLowerCase() === alias.toLowerCase());
    if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null && String(row[foundKey]).trim() !== '') {
      return String(row[foundKey]).trim();
    }
  }
  // Second pass: diacritic-insensitive normalized match
  const normalizedAliases = aliases.map(normalizeHeaderKey);
  for (const normAlias of normalizedAliases) {
    const foundKey = keys.find(k => normalizeHeaderKey(k) === normAlias);
    if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null && String(row[foundKey]).trim() !== '') {
      return String(row[foundKey]).trim();
    }
  }
  return '';
}

function extractInlineMcqFromCellText(rawCell: string): {
  content: string;
  optMap: Record<string, string>;
  markedLetters: string[];
  inlineAnswer: string;
} {
  const lines = rawCell
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  const contentLines: string[] = [];
  const optMap: Record<string, string> = {};
  const markedLetters: string[] = [];
  let inlineAnswer = '';

  for (const line of lines) {
    const ansMatch = line.match(/^(?:Đáp án(?:\s*đúng)?|Dap an|Key|DA|ĐA|Answer)\s*[:\-]\s*(.+)$/i);
    if (ansMatch) {
      inlineAnswer = ansMatch[1].trim();
      continue;
    }

    const optMatch = line.match(/^(\*|✓|✔|\[[xX*]\]|\([xX*]\))?\s*([A-D])\s*(\*)?\s*[.):]\s*(.+)$/i);
    if (optMatch) {
      const letter = optMatch[2].toUpperCase();
      const cleaned = cleanMarkedOptionText(optMatch[4]);
      optMap[letter] = cleaned.text;
      if (optMatch[1] || optMatch[3] || cleaned.isMarked) {
        markedLetters.push(letter);
      }
      continue;
    }

    contentLines.push(line);
  }

  return {
    content: contentLines.join('\n').trim(),
    optMap,
    markedLetters,
    inlineAnswer,
  };
}

function parseAnswerKeyFromText(lines: string[]): Record<number, string> {
  const map: Record<number, string> = {};
  const joined = lines.join('\n');

  // Match patterns like "Câu 1: A", "1. B", "1-C", "1) D", "1: A,C", "1A"
  const pairRegex = /(?:^|[\s,;|])(?:Câu|Cau|Question|Q)?\s*(\d{1,3})\s*(?:[.):\-]+|\s)\s*([A-Da-d](?:\s*[,&/]\s*[A-Da-d])*)(?=$|[\s,;|.])/g;
  let match: RegExpExecArray | null;
  while ((match = pairRegex.exec(joined)) !== null) {
    const qNum = Number(match[1]);
    const ansVal = match[2].toUpperCase().replace(/\s+/g, '');
    if (qNum > 0 && qNum <= 500 && ansVal) {
      map[qNum] = ansVal;
    }
  }

  // Also compact form: "1A 2B 3C 4D"
  const compactRegex = /\b(\d{1,3})([A-Da-d])\b/g;
  while ((match = compactRegex.exec(joined)) !== null) {
    const qNum = Number(match[1]);
    if (qNum > 0 && qNum <= 500 && !map[qNum]) {
      map[qNum] = match[2].toUpperCase();
    }
  }

  return map;
}

function isNonQuestionNoiseLine(trimmed: string): boolean {
  if (!trimmed) return true;
  if (/^[-=_*~.]{3,}$/.test(trimmed)) return true;
  if (/^(?:Trang|Page)\s*\d+(?:\s*\/\s*\d+)?$/i.test(trimmed)) return true;
  return false;
}

function buildParsedDraftFromFields(params: {
  tempId: string;
  questionType: QuestionType;
  difficulty: DifficultyLevel;
  content: string;
  codeSnippet?: string;
  sampleSolution?: string;
  optA?: string;
  optB?: string;
  optC?: string;
  optD?: string;
  markedLetters?: string[];
  rawAns: string;
  explanation?: string;
  points?: number;
  defaultChapterId: string;
  sourceLabel: string;
}): ParsedQuestionDraft {
  const warnings: string[] = [];
  let options: QuestionOption[] = [];
  let correctAnswer: string | string[] = '';
  let answerDetected = false;

  const marked = Array.from(new Set(params.markedLetters || []));

  if (params.questionType === 'single_choice' || params.questionType === 'multiple_choice') {
    const cA = cleanMarkedOptionText(params.optA || '');
    const cB = cleanMarkedOptionText(params.optB || '');
    const cC = cleanMarkedOptionText(params.optC || '');
    const cD = cleanMarkedOptionText(params.optD || '');

    if (cA.isMarked) marked.push('A');
    if (cB.isMarked) marked.push('B');
    if (cC.isMarked) marked.push('C');
    if (cD.isMarked) marked.push('D');

    options = [
      { id: 'opt_1', text: cA.text || 'Phương án A' },
      { id: 'opt_2', text: cB.text || 'Phương án B' },
      { id: 'opt_3', text: cC.text || 'Phương án C' },
      { id: 'opt_4', text: cD.text || 'Phương án D' },
    ];

    let extractedIds = extractAnswerOptIds(params.rawAns, options);
    if (extractedIds.length === 0 && marked.length > 0 && marked.length < 4) {
      extractedIds = marked.map(mapAnswerLetterToOptId).filter(Boolean);
    }

    if (extractedIds.length > 0) {
      answerDetected = true;
      if (params.questionType === 'multiple_choice' || extractedIds.length > 1) {
        correctAnswer = extractedIds;
      } else {
        correctAnswer = extractedIds[0];
      }
    } else {
      answerDetected = false;
      correctAnswer = params.questionType === 'multiple_choice' ? ['opt_1'] : 'opt_1';
      warnings.push('Chưa tìm thấy đáp án trực tiếp trong file, tạm mặc định A (vui lòng kiểm tra lại).');
    }
  } else if (params.questionType === 'true_false') {
    options = [
      { id: 'opt_true', text: 'Đúng' },
      { id: 'opt_false', text: 'Sai' },
    ];
    const lower = params.rawAns.trim().toLowerCase();
    if (lower) {
      answerDetected = true;
      correctAnswer =
        lower === 'sai' || lower === 'false' || lower === 'f' || lower === 'b' || lower === '0'
          ? 'opt_false'
          : 'opt_true';
    } else {
      correctAnswer = 'opt_true';
      warnings.push('Chưa thấy đáp án Đúng/Sai trong file, tạm chọn Đúng.');
    }
  } else {
    correctAnswer = params.rawAns || '';
    answerDetected = Boolean(params.rawAns);
    if (!params.rawAns && params.questionType === 'fill_blank') {
      warnings.push('Câu điền khuyết chưa có đáp án chuẩn.');
    }
  }

  const finalType: QuestionType =
    (params.questionType === 'single_choice' && Array.isArray(correctAnswer))
      ? 'multiple_choice'
      : params.questionType;

  return {
    tempId: params.tempId,
    questionType: finalType,
    difficulty: params.difficulty,
    content: params.content,
    codeSnippet: params.codeSnippet || undefined,
    sampleSolution: params.sampleSolution || undefined,
    answerDetected,
    options,
    correctAnswer,
    explanation:
      params.explanation ||
      (finalType === 'essay'
        ? 'Sinh viên trình bày đúng giải thuật, xử lý đầy đủ đầu vào/đầu ra và trường hợp biên.'
        : `Đáp án được hệ thống tự động trích xuất từ ${params.sourceLabel}.`),
    points: params.points && params.points > 0 ? params.points : finalType === 'essay' ? 5 : 1,
    chapterId: params.defaultChapterId,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

export async function parseExcelQuestions(
  file: File,
  defaultChapterId: string
): Promise<ParsedQuestionDraft[]> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);
  const firstSheet = workbook.worksheets[0];
  if (!firstSheet) {
    throw new Error('File Excel không có sheet dữ liệu nào.');
  }

  // Optional answer-key map from secondary sheets (e.g. "DapAn", "Đáp án", "Key")
  const sheetAnswerKey: Record<number, string> = {};
  for (let sIdx = 1; sIdx < workbook.worksheets.length; sIdx++) {
    const ws = workbook.worksheets[sIdx];
    const name = ws.name;
    const norm = normalizeHeaderKey(name);
    if (norm.includes('dap an') || norm.includes('dapan') || norm.includes('key') || norm.includes('answer')) {
      ws.eachRow({ includeEmpty: true }, (row) => {
        const rowArr = (row.values as any[]) || [];
        for (let c = 1; c < rowArr.length - 1; c++) {
          const num = Number(String(rowArr[c] || '').replace(/\D/g, ''));
          const ans = String(rowArr[c + 1] || '').trim().toUpperCase();
          if (num > 0 && /^[A-D](?:\s*[,/&]\s*[A-D])*$/.test(ans)) {
            sheetAnswerKey[num] = ans;
          }
        }
      });
    }
  }

  const matrix: any[][] = [];
  firstSheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const rowValues: any[] = [];
    const values = row.values as any[];
    if (Array.isArray(values)) {
      for (let i = 1; i < values.length; i++) {
        const cellVal = values[i];
        let strVal = '';
        if (cellVal !== undefined && cellVal !== null) {
          if (typeof cellVal === 'object' && 'text' in cellVal) {
            strVal = String((cellVal as any).text || '');
          } else if (typeof cellVal === 'object' && 'richText' in cellVal) {
            strVal = (cellVal as any).richText.map((rt: any) => rt.text || '').join('');
          } else {
            strVal = String(cellVal);
          }
        }
        rowValues.push(strVal);
      }
    }
    matrix[rowNumber - 1] = rowValues;
  });

  if (!matrix || matrix.length === 0) {
    throw new Error('Sheet Excel trống hoặc không đúng định dạng bảng câu hỏi.');
  }

  // Locate header row cleanly (skipping title/school/preamble rows at top of Excel)
  const questionHeaderKeywords = new Set([
    'noi dung cau hoi', 'cau hoi', 'noi dung', 'question', 'content', 'de bai', 'ten cau hoi',
  ]);
  const optionAnswerKeywords = new Set([
    'dap an a', 'phuong an a', 'a', 'option a', 'dap an dung', 'dap an', 'key', 'answer', 'correct', 'correct answer',
  ]);

  let headerRowIdx = 0;
  for (let r = 0; r < Math.min(matrix.length, 25); r++) {
    const rowCells = (matrix[r] || []).map((c: any) => normalizeHeaderKey(String(c || '')));
    const hasQ = rowCells.some(c => questionHeaderKeywords.has(c));
    const optAnsHits = rowCells.filter(c => optionAnswerKeywords.has(c)).length;
    if (hasQ || optAnsHits >= 2) {
      headerRowIdx = r;
      break;
    }
  }

  const headers = (matrix[headerRowIdx] || []).map((h: any, idx: number) => {
    const str = String(h || '').trim();
    return str || `__col_${idx}`;
  });

  const rows: Record<string, any>[] = [];
  for (let r = headerRowIdx + 1; r < matrix.length; r++) {
    const rowArr = matrix[r] || [];
    const obj: Record<string, any> = {};
    let hasValue = false;
    headers.forEach((h, idx) => {
      const val = rowArr[idx];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        hasValue = true;
      }
      obj[h] = val ?? '';
    });
    if (hasValue) rows.push(obj);
  }

  if (rows.length === 0) {
    throw new Error('Sheet Excel không có dòng dữ liệu câu hỏi nào.');
  }

  const parsed: ParsedQuestionDraft[] = [];
  const footerNoiseRegex = /^(?:tổng\s*(?:cộng|số\s*câu)|hết(?:\s*đề)?|giảng\s*viên\s*(?:biên\s*soạn|ra\s*đề)|duyệt\s*đề|ghi\s*chú\s*chung)\b/i;

  rows.forEach((row, index) => {
    const rawContent = pickField(row, [
      'nội dung câu hỏi', 'noi dung cau hoi', 'câu hỏi', 'cau hoi', 'nội dung', 'noi dung', 'tên câu hỏi', 'ten cau hoi', 'question', 'content', 'đề bài', 'de bai'
    ]);
    if (!rawContent || footerNoiseRegex.test(rawContent)) return;

    let optA = pickField(row, ['đáp án a', 'dap an a', 'phương án a', 'phuong an a', 'lựa chọn a', 'lua chon a', 'a', 'a.', 'option_a', 'option a', 'pa1', 'pa 1', 'option 1']);
    let optB = pickField(row, ['đáp án b', 'dap an b', 'phương án b', 'phuong an b', 'lựa chọn b', 'lua chon b', 'b', 'b.', 'option_b', 'option b', 'pa2', 'pa 2', 'option 2']);
    let optC = pickField(row, ['đáp án c', 'dap an c', 'phương án c', 'phuong an c', 'lựa chọn c', 'lua chon c', 'c', 'c.', 'option_c', 'option c', 'pa3', 'pa 3', 'option 3']);
    let optD = pickField(row, ['đáp án d', 'dap an d', 'phương án d', 'phuong an d', 'lựa chọn d', 'lua chon d', 'd', 'd.', 'option_d', 'option d', 'pa4', 'pa 4', 'option 4']);

    let content = rawContent
      .replace(/^(?:Câu(?:\s+hỏi)?|Bài(?:\s+tập)?|Question)\s*\d+\s*[:.)\-]\s*/i, '')
      .trim();
    let markedLetters: string[] = [];
    let inlineAnsFromCell = '';

    // Support MCQ options + "Đáp án:" embedded inside the Question cell if columns A-D are empty
    if (!optA && !optB && !optC && !optD && /\n\s*[A-D]\s*[.):]/i.test(rawContent)) {
      const embedded = extractInlineMcqFromCellText(rawContent);
      if (Object.keys(embedded.optMap).length >= 2) {
        content = embedded.content
          .replace(/^(?:Câu(?:\s+hỏi)?|Bài(?:\s+tập)?|Question)\s*\d+\s*[:.)\-]\s*/i, '')
          .trim();
        optA = embedded.optMap.A || '';
        optB = embedded.optMap.B || '';
        optC = embedded.optMap.C || '';
        optD = embedded.optMap.D || '';
        markedLetters = embedded.markedLetters;
        inlineAnsFromCell = embedded.inlineAnswer;
      }
    }

    // Ignore standalone section headings inside table like "PHẦN I: TRẮC NGHIỆM" when no options exist
    const hasMcqOptions = Boolean(optA || optB || optC || optD);
    if (!hasMcqOptions && /^(?:PHẦN\s+[IVX0-9]+|[IVX]+\.\s+)/i.test(content)) {
      return;
    }

    const rawType = pickField(row, ['loại', 'loai', 'loại câu hỏi', 'loai cau hoi', 'dạng', 'dang', 'type', 'question_type']);
    const questionType = normalizeQuestionType(rawType, hasMcqOptions);

    const codeSnippet = pickField(row, ['đoạn mã', 'doan ma', 'code', 'codesnippet', 'code_snippet', 'mã nguồn', 'ma nguon']);
    const sampleSolution = pickField(row, ['code chuẩn', 'code chuan', 'code mẫu', 'code mau', 'lời giải mẫu', 'loi giai mau', 'sample_solution', 'solution']);
    const rawStt = pickField(row, ['stt', 'câu số', 'cau so', 'số thứ tự', 'no']);
    const qNumber = Number(rawStt.replace(/\D/g, '')) || parsed.length + 1;

    const rawAnsFromCol = pickField(row, [
      'đáp án đúng', 'dap an dung', 'đáp án', 'dap an', 'đáp án chuẩn', 'dap an chuan',
      'kết quả', 'ket qua', 'key', 'da', 'đa', 'answer', 'correct', 'correct_answer', 'correct answer',
      'từ khóa chấm', 'rubric'
    ]);
    const rawAns = rawAnsFromCol || inlineAnsFromCell || sheetAnswerKey[qNumber] || '';
    const explanation = pickField(row, ['giải thích', 'giai thich', 'lời giải', 'loi giai', 'hướng dẫn', 'huong dan', 'explanation']);
    const rawDiff = pickField(row, ['độ khó', 'do kho', 'mức độ', 'muc do', 'difficulty']);
    const rawPoints = pickField(row, ['điểm', 'diem', 'points', 'score']);
    const numericPoints = Number(rawPoints.replace(',', '.'));

    parsed.push(
      buildParsedDraftFromFields({
        tempId: makeTempId('imp_xl'),
        questionType,
        difficulty: normalizeDifficulty(rawDiff),
        content,
        codeSnippet,
        sampleSolution,
        optA,
        optB,
        optC,
        optD,
        markedLetters,
        rawAns,
        explanation,
        points: !Number.isNaN(numericPoints) && numericPoints > 0 ? numericPoints : undefined,
        defaultChapterId,
        sourceLabel: 'ngân hàng câu hỏi Excel (.xlsx)',
      })
    );
  });

  if (parsed.length === 0) {
    throw new Error('Không đọc được câu hỏi nào từ file Excel. Vui lòng kiểm tra cột Câu hỏi, Đáp án A-D và Đáp án đúng.');
  }

  return parsed;
}

function splitInlineMultiOptions(lineObj: StyledLine): StyledLine[] {
  const text = lineObj.text;
  // Detect lines containing multiple options like: "A. foo    B. bar    C. baz    D. qux" or tabbed "A) ... \t B) ..."
  const multiOptSplitRegex = /(?:\t+|\s{2,})(?=(?:\*|✓|✔|\[[xX*]\]|\([xX*]\))?\s*[B-Db-d]\s*[.):]\s+)/g;
  if (!multiOptSplitRegex.test(text)) {
    return [lineObj];
  }

  // Only split if line starts with option A (or contains A.. and B..)
  if (!/^(?:\*|✓|✔|\[[xX*]\]|\([xX*]\))?\s*[Aa]\s*[.):]\s+/.test(text.trim())) {
    return [lineObj];
  }

  const chunks = text
    .split(/(?:\t+|\s{2,})(?=(?:\*|✓|✔|\[[xX*]\]|\([xX*]\))?\s*[A-Da-d]\s*[.):]\s+)/g)
    .map(c => c.trim())
    .filter(Boolean);

  if (chunks.length <= 1) return [lineObj];

  return chunks.map(chunk => {
    const cleanChunkText = chunk.replace(/^(?:\*|✓|✔|\[[xX*]\]|\([xX*]\))?\s*[A-Da-d]\s*[.):]\s+/, '').trim();
    const isChunkEmphasized = Boolean(
      lineObj.emphasizedFragments?.some(frag => {
        const cleanFrag = frag.trim();
        return cleanFrag.length > 0 && (chunk.includes(cleanFrag) || (cleanChunkText.length >= 2 && cleanFrag.includes(cleanChunkText)));
      })
    );
    return {
      text: chunk,
      isWholeBold: isChunkEmphasized,
      isWholeUnderline: isChunkEmphasized,
      isWholeHighlighted: isChunkEmphasized,
      emphasizedFragments: lineObj.emphasizedFragments,
    };
  });
}

async function extractDocxLinesAndTables(arrayBuffer: ArrayBuffer): Promise<{
  lines: StyledLine[];
  tableQuestions: ParsedQuestionDraft[];
  tableAnswerKey: Record<number, string>;
}> {
  const tableQuestions: ParsedQuestionDraft[] = [];
  const tableAnswerKey: Record<number, string> = {};

  const mammothInput: any =
    typeof Buffer !== 'undefined'
      ? { arrayBuffer, buffer: Buffer.from(arrayBuffer) }
      : { arrayBuffer };

  if (typeof DOMParser !== 'undefined') {
    try {
      const htmlResult = await (mammoth.convertToHtml as (
        input: any,
        options?: { styleMap?: string[] }
      ) => Promise<{ value: string }>)(
        mammothInput,
        { styleMap: ['u => u', 'strike => s'] }
      );
      const html = htmlResult.value || '';
      if (html.trim()) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const extractedLines: StyledLine[] = [];

        const analyzeInlineStyles = (el: Element): Omit<StyledLine, 'text'> => {
          const fullText = (el.textContent || '').replace(/\u00A0/g, ' ').trim();
          const strongEls = Array.from(el.querySelectorAll('strong, b'));
          const uEls = Array.from(el.querySelectorAll('u'));
          const markEls = Array.from(el.querySelectorAll('mark, span[style*="background"], span[style*="color"]'));

          const boldText = strongEls.map(s => (s.textContent || '').trim()).join(' ').trim();
          const uText = uEls.map(u => (u.textContent || '').trim()).join(' ').trim();
          const markText = markEls.map(m => (m.textContent || '').trim()).join(' ').trim();

          const emphasizedFragments = [
            ...strongEls.map(s => (s.textContent || '').trim()),
            ...uEls.map(u => (u.textContent || '').trim()),
            ...markEls.map(m => (m.textContent || '').trim()),
          ].filter(s => s.length >= 1);

          return {
            isWholeBold: Boolean(fullText && boldText && boldText.length >= Math.max(1, fullText.length * 0.6)),
            isWholeUnderline: Boolean(fullText && uText && uText.length >= 1),
            isWholeHighlighted: Boolean(fullText && markText && markText.length >= Math.max(1, fullText.length * 0.4)),
            emphasizedFragments,
          };
        };

        const bodyChildren = Array.from(doc.body.children);
        let globalOlCounter = 0;

        const pushParagraphEl = (el: Element, forcedPrefix = '') => {
          const raw = (el.textContent || '').replace(/\u00A0/g, ' ').replace(/\u200B/g, '').trim();
          if (!raw) return;
          const styles = analyzeInlineStyles(el);
          // Preserve line breaks inside paragraph
          const subLines = raw.split('\n').map(s => s.trim()).filter(Boolean);
          subLines.forEach((sub, sIdx) => {
            const text = sIdx === 0 && forcedPrefix ? `${forcedPrefix}${sub}` : sub;
            extractedLines.push({
              text,
              ...styles,
            });
          });
        };

        for (const child of bodyChildren) {
          const tag = child.tagName.toLowerCase();

          if (tag === 'table') {
            const rows = Array.from(child.querySelectorAll('tr')).map(tr =>
              Array.from(tr.querySelectorAll('th, td')).map(td => ({
                text: (td.textContent || '').replace(/\u00A0/g, ' ').trim(),
                hasEmphasis: Boolean(td.querySelector('strong, b, u, mark')),
              }))
            );

            if (rows.length === 0) continue;

            // Check if table is an Answer Key table (e.g., 1 | A | 2 | B or header Câu | Đáp án)
            const firstRowNorm = rows[0].map(c => normalizeHeaderKey(c.text));
            const looksLikeKeyHeader =
              firstRowNorm.some(h => h === 'cau' || h === 'stt') &&
              firstRowNorm.some(h => h.includes('dap an') || h === 'key' || h === 'da');

            const pairCellCount = rows.reduce((acc, r) => {
              let hits = 0;
              for (let i = 0; i < r.length - 1; i++) {
                if (/^\d{1,3}[.):]?$/.test(r[i].text) && /^[A-Da-d](?:\s*[,/&]\s*[A-Da-d])*$/.test(r[i + 1].text)) {
                  hits++;
                }
              }
              return acc + hits;
            }, 0);

            if (looksLikeKeyHeader || pairCellCount >= 2) {
              rows.forEach(r => {
                for (let i = 0; i < r.length - 1; i++) {
                  const nMatch = r[i].text.match(/^(?:Câu\s*)?(\d{1,3})[.):]?$/i);
                  const aMatch = r[i + 1].text.match(/^([A-Da-d](?:\s*[,/&]\s*[A-Da-d])*)$/i);
                  if (nMatch && aMatch) {
                    tableAnswerKey[Number(nMatch[1])] = aMatch[1].toUpperCase().replace(/\s+/g, '');
                  }
                }
              });
              continue;
            }

            // Check if table is a structured question bank table (Câu hỏi | A | B | C | D | Đáp án)
            const hasQuestionCol = firstRowNorm.some(
              h => h === 'cau hoi' || h === 'noi dung' || h === 'noi dung cau hoi' || h === 'question'
            );
            const hasOptACol = firstRowNorm.some(h => h === 'a' || h === 'dap an a' || h === 'phuong an a');

            if (hasQuestionCol || hasOptACol) {
              const headerLabels = rows[0].map(c => c.text);
              for (let rIdx = 1; rIdx < rows.length; rIdx++) {
                const rowObj: Record<string, string> = {};
                headerLabels.forEach((lbl, cIdx) => {
                  rowObj[lbl || `__col_${cIdx}`] = rows[rIdx][cIdx]?.text || '';
                });
                const qText = pickField(rowObj, ['nội dung câu hỏi', 'câu hỏi', 'nội dung', 'question', 'content']);
                if (!qText) continue;
                const optA = pickField(rowObj, ['đáp án a', 'phương án a', 'a']);
                const optB = pickField(rowObj, ['đáp án b', 'phương án b', 'b']);
                const optC = pickField(rowObj, ['đáp án c', 'phương án c', 'c']);
                const optD = pickField(rowObj, ['đáp án d', 'phương án d', 'd']);
                const ans = pickField(rowObj, ['đáp án đúng', 'đáp án', 'key', 'answer']);
                const exp = pickField(rowObj, ['giải thích', 'lời giải', 'explanation']);
                const diff = pickField(rowObj, ['độ khó', 'difficulty']);
                const pts = Number(pickField(rowObj, ['điểm', 'points', 'score']).replace(',', '.'));
                const hasOpts = Boolean(optA || optB || optC || optD);

                tableQuestions.push(
                  buildParsedDraftFromFields({
                    tempId: makeTempId('imp_doctbl'),
                    questionType: normalizeQuestionType(pickField(rowObj, ['loại', 'type']), hasOpts),
                    difficulty: normalizeDifficulty(diff),
                    content: qText.replace(/^(?:Câu|Bài)\s*\d+\s*[:.)\-]\s*/i, '').trim(),
                    optA,
                    optB,
                    optC,
                    optD,
                    rawAns: ans,
                    explanation: exp,
                    points: !Number.isNaN(pts) && pts > 0 ? pts : undefined,
                    defaultChapterId: 'ch_general',
                    sourceLabel: 'bảng câu hỏi trong Word (.docx)',
                  })
                );
              }
              continue;
            }

            // Otherwise flatten cells into lines if table simply wraps questions/options
            rows.forEach(r => {
              r.forEach(cell => {
                if (cell.text) {
                  extractedLines.push({
                    text: cell.text,
                    isWholeBold: cell.hasEmphasis,
                    isWholeUnderline: cell.hasEmphasis,
                  });
                }
              });
            });
          } else if (tag === 'ol' || tag === 'ul') {
            const listItems = Array.from(child.children).filter(c => c.tagName.toLowerCase() === 'li');
            const olType = (child.getAttribute('type') || '').trim();
            const startAttr = Number(child.getAttribute('start') || '1') || 1;
            let idxInList = startAttr;

            for (const li of listItems) {
              // Extract direct text / paragraphs inside li without nested lists first
              const clone = li.cloneNode(true) as Element;
              const nestedLists = Array.from(clone.querySelectorAll('ol, ul'));
              nestedLists.forEach(nl => nl.remove());

              const liText = (clone.textContent || '').replace(/\u00A0/g, ' ').trim();
              let prefix = '';
              if (tag === 'ol' && liText) {
                if (olType === 'A' || olType === 'a') {
                  const letter = String.fromCharCode(65 + ((idxInList - 1) % 26));
                  if (!/^[A-Da-d]\s*[.):]/.test(liText)) prefix = `${letter}. `;
                } else {
                  globalOlCounter++;
                  if (!/^(?:Câu|Bài|Question|\d+\s*[.)])/i.test(liText)) {
                    prefix = `${idxInList}. `;
                  }
                }
              }

              if (liText) {
                const styles = analyzeInlineStyles(clone);
                extractedLines.push({
                  text: `${prefix}${liText}`,
                  ...styles,
                });
              }

              // Also process any nested option lists (<ol type="A"> or <ul> inside <li>)
              const originalNested = Array.from(li.querySelectorAll(':scope > ol, :scope > ul'));
              originalNested.forEach(subList => {
                const subItems = Array.from(subList.children).filter(c => c.tagName.toLowerCase() === 'li');
                const subType = (subList.getAttribute('type') || '').trim();
                subItems.forEach((subLi, sIdx) => {
                  const subText = (subLi.textContent || '').replace(/\u00A0/g, ' ').trim();
                  if (!subText) return;
                  let subPrefix = '';
                  if (subList.tagName.toLowerCase() === 'ol' && (subType === 'A' || subType === 'a' || subItems.length <= 4)) {
                    const letter = String.fromCharCode(65 + (sIdx % 4));
                    if (!/^[A-Da-d]\s*[.):]/.test(subText)) subPrefix = `${letter}. `;
                  }
                  extractedLines.push({
                    text: `${subPrefix}${subText}`,
                    ...analyzeInlineStyles(subLi),
                  });
                });
              });

              idxInList++;
            }
          } else {
            pushParagraphEl(child);
          }
        }

        if (extractedLines.length > 0 || tableQuestions.length > 0) {
          return { lines: extractedLines, tableQuestions, tableAnswerKey };
        }
      }
    } catch {
      // Fall back to extractRawText if HTML parse fails
    }
  }

  const rawResult = await mammoth.extractRawText(mammothInput);
  const rawText = (rawResult.value || '')
    .replace(/\u200B/g, '')
    .replace(/\r\n/g, '\n')
    .trim();

  const lines: StyledLine[] = rawText
    .split('\n')
    .map(text => ({ text: text.trim() }))
    .filter(l => l.text.length > 0);

  return { lines, tableQuestions, tableAnswerKey };
}

export async function parseWordQuestions(
  file: File,
  defaultChapterId: string,
  parseOptions?: { isPracticalSubject?: boolean }
): Promise<ParsedQuestionDraft[]> {
  const isPracticalSubject = Boolean(parseOptions?.isPracticalSubject);
  const arrayBuffer = await file.arrayBuffer();

  const { lines: initialLines, tableQuestions, tableAnswerKey } = await extractDocxLinesAndTables(arrayBuffer);

  // If the Word file was formatted as a structured table question bank with no paragraph questions
  if (tableQuestions.length > 0 && initialLines.length < 4) {
    return tableQuestions.map(q => ({ ...q, chapterId: defaultChapterId }));
  }

  // Expand inline multi-option lines like "A. ...   B. ...   C. ...   D. ..."
  const lines: StyledLine[] = [];
  initialLines.forEach(lineObj => {
    splitInlineMultiOptions(lineObj).forEach(part => lines.push(part));
  });

  if (lines.length === 0 && tableQuestions.length === 0) {
    throw new Error('File Word (.docx) không có nội dung văn bản để đọc.');
  }

  // Explicit question header: "Câu 1:", "Câu hỏi 2.", "Bài 1:", "Question 1:"
  const explicitHeaderRegex = /^(?:Câu(?:\s+hỏi)?|Bài(?:\s+tập)?|Question)\s*\d+(?:\s*[:.)\-]|\s+(?=[\[(]|[A-ZÀ-Ỹ0-9])|$)/i;
  // Numbered top-level fallback ONLY when no explicit Câu/Bài/Question header exists
  const numberedHeaderRegex = /^\d+[.)]\s+\S/;
  const hasExplicitHeaders = lines.some(l => explicitHeaderRegex.test(l.text));
  const questionStartRegex = hasExplicitHeaders ? explicitHeaderRegex : numberedHeaderRegex;

  // Footer vs Answer Key appendix markers
  const answerKeySectionRegex =
    /^(?:[-=_*\s]*)(?:BẢNG\s+ĐÁP\s+ÁN|ĐÁP\s+ÁN\s+(?:TRẮC\s+NGHIỆM|ĐỀ\s+THI|THAM\s+KHẢO|TỔNG\s+HỢP|CHUẨN)|HƯỚNG\s+DẪN\s+CHẤM\s+TỔNG\s+HỢP|KEY(?:\s+ĐÁP\s+ÁN)?)\s*[:\-]?/i;
  const hardFooterStopRegex =
    /^(?:[-=_*\s]*(?:HẾT(?:\s+BÀI|\s+ĐỀ)?|THE\s+END)[-=_*\s!.]*|(?:CHÚC\s+(?:CÁC\s+)?(?:BẠN|EM|SINH\s+VIÊN)\s+LÀM\s+BÀI|GIẢNG\s+VIÊN\s+RA\s+ĐỀ|TRƯỞNG\s+BỘ\s+MÔN|CÁN\s+BỘ\s+COI\s+THI|DUYỆT\s+ĐỀ)\b.*)$/i;
  const sectionDividerRegex =
    /^(?:PHẦN\s+[IVX0-9]+(?:\s*[:.\-].*)?|[IVX]+\.\s+(?:TRẮC\s+NGHIỆM|TỰ\s+LUẬN|THỰC\s+HÀNH|LÝ\s+THUYẾT).*|CHƯƠNG\s+\d+\s*[:.\-].*)$/i;

  const blocks: StyledLine[][] = [];
  let currentBlock: StyledLine[] = [];
  const answerKeyLines: string[] = [];
  let inAnswerKeyAppendix = false;

  for (const lineObj of lines) {
    const trimmed = lineObj.text.trim();
    if (isNonQuestionNoiseLine(trimmed)) continue;

    if (inAnswerKeyAppendix) {
      if (!hardFooterStopRegex.test(trimmed)) {
        answerKeyLines.push(trimmed);
      }
      continue;
    }

    if (currentBlock.length > 0 && answerKeySectionRegex.test(trimmed)) {
      inAnswerKeyAppendix = true;
      answerKeyLines.push(trimmed);
      continue;
    }

    if (currentBlock.length > 0 && hardFooterStopRegex.test(trimmed)) {
      // Wait — check if an answer key section follows later; stop adding to currentBlock
      if (currentBlock.length > 0) {
        blocks.push(currentBlock);
        currentBlock = [];
      }
      // Do not break immediately in case BẢNG ĐÁP ÁN appears after "HẾT"
      inAnswerKeyAppendix = true;
      continue;
    }

    if (sectionDividerRegex.test(trimmed) && !questionStartRegex.test(trimmed)) {
      continue;
    }

    if (questionStartRegex.test(trimmed)) {
      if (currentBlock.length > 0) {
        blocks.push(currentBlock);
      }
      currentBlock = [lineObj];
    } else {
      if (currentBlock.length === 0) {
        // Strictly ignore non-question preamble before Câu 1
        continue;
      }
      currentBlock.push(lineObj);
    }
  }
  if (currentBlock.length > 0) {
    blocks.push(currentBlock);
  }

  // Merge trailing answer-key appendix + tableAnswerKey
  const trailingAnswerKeyMap: Record<number, string> = {
    ...parseAnswerKeyFromText(answerKeyLines),
    ...tableAnswerKey,
  };

  if (blocks.length === 0 && tableQuestions.length > 0) {
    return tableQuestions.map((q, idx) => {
      const qNum = idx + 1;
      if (!q.answerDetected && trailingAnswerKeyMap[qNum]) {
        const ids = extractAnswerOptIds(trailingAnswerKeyMap[qNum], q.options);
        if (ids.length > 0) {
          return {
            ...q,
            chapterId: defaultChapterId,
            correctAnswer: ids.length > 1 ? ids : ids[0],
            answerDetected: true,
            warnings: undefined,
          };
        }
      }
      return { ...q, chapterId: defaultChapterId };
    });
  }

  if (blocks.length === 0) {
    throw new Error(
      'Không tìm thấy câu hỏi hợp lệ trong file Word (.docx). Vui lòng đánh số câu hỏi theo định dạng "Câu 1:", "Câu 2:", "Bài 1:" hoặc "1." để hệ thống chỉ đọc đúng phần câu hỏi.'
    );
  }

  const parsed: ParsedQuestionDraft[] = [];

  blocks.forEach((blockLineObjs, index) => {
    const blockText = blockLineObjs.map(l => l.text).join('\n').trim();
    if (!blockText) return;

    // Extract optional fenced code block ```...```
    let codeSnippet = '';
    const codeMatch = blockText.match(/```(?:\w+)?\n?([\s\S]*?)```/);
    if (codeMatch) {
      codeSnippet = codeMatch[1].trim();
    }

    const cleanLineObjs = blockLineObjs
      .filter(l => {
        if (!codeMatch) return true;
        return !codeMatch[0].includes(l.text);
      })
      .map(l => ({ ...l, text: l.text.trim() }))
      .filter(l => l.text.length > 0);

    if (cleanLineObjs.length === 0) return;

    // Extract question number if present (e.g. Câu 5 -> 5) so trailing BẢNG ĐÁP ÁN maps 100% accurately even if numbers skip
    const qNumMatch = cleanLineObjs[0].text.match(/^(?:Câu(?:\s+hỏi)?|Bài(?:\s+tập)?|Question)\s*(\d+)|^(\d+)[.)]/i);
    const questionNumber = qNumMatch ? Number(qNumMatch[1] || qNumMatch[2]) : index + 1;

    // Strip question prefix "Câu 1:", "Bài 2.", etc.
    let firstLine = cleanLineObjs[0].text
      .replace(/^(?:Câu(?:\s+hỏi)?|Bài(?:\s+tập)?|Question)\s*\d+\s*[:.)\-]?\s*/i, '')
      .replace(/^\d+[.)]\s*/, '')
      .trim();

    // Extract inline answer in question header e.g. "(Đáp án: B)" or "[Đáp án C]" or "[B]"
    let headerInlineAnswer = '';
    const inlineAnsInHeader = firstLine.match(/[\[(]\s*(?:Đáp\s*án(?:\s*đúng)?|Key|ĐA)\s*[:\-]?\s*([A-D](?:\s*[,&/]\s*[A-D])*)\s*[\])]/i);
    if (inlineAnsInHeader) {
      headerInlineAnswer = inlineAnsInHeader[1].trim();
      firstLine = firstLine.replace(inlineAnsInHeader[0], '').trim();
    }

    let explicitType: QuestionType | null = null;
    if (/\[(thực hành|thuc hanh|tự luận|tu luan|practical|essay)\]/i.test(firstLine)) {
      explicitType = 'essay';
      firstLine = firstLine.replace(/\[(thực hành|thuc hanh|tự luận|tu luan|practical|essay)\]/gi, '').trim();
    } else if (/\[(đúng\/sai|dung\/sai|true\/false)\]/i.test(firstLine)) {
      explicitType = 'true_false';
      firstLine = firstLine.replace(/\[(đúng\/sai|dung\/sai|true\/false)\]/gi, '').trim();
    } else if (/\[(nhiều đáp án|nhieu dap an|multiple)\]/i.test(firstLine)) {
      explicitType = 'multiple_choice';
      firstLine = firstLine.replace(/\[(nhiều đáp án|nhieu dap an|multiple)\]/gi, '').trim();
    } else if (/\[(trắc nghiệm|trac nghiem|mcq)\]/i.test(firstLine)) {
      explicitType = 'single_choice';
      firstLine = firstLine.replace(/\[(trắc nghiệm|trac nghiem|mcq)\]/gi, '').trim();
    }

    let points = 0;
    const ptsMatch = firstLine.match(/[\[(](\d+(?:[.,]\d+)?)\s*(?:điểm|diem|đ|pts?)[\])]/i);
    if (ptsMatch) {
      points = Number(ptsMatch[1].replace(',', '.'));
      firstLine = firstLine.replace(ptsMatch[0], '').trim();
    }

    let difficulty: DifficultyLevel = 'medium';
    if (/\[(dễ|de|easy)\]/i.test(firstLine)) {
      difficulty = 'easy';
      firstLine = firstLine.replace(/\[(dễ|de|easy)\]/gi, '').trim();
    } else if (/\[(khó|kho|hard)\]/i.test(firstLine)) {
      difficulty = 'hard';
      firstLine = firstLine.replace(/\[(khó|kho|hard)\]/gi, '').trim();
    } else if (/\[(trung bình|tb|medium)\]/i.test(firstLine)) {
      difficulty = 'medium';
      firstLine = firstLine.replace(/\[(trung bình|tb|medium)\]/gi, '').trim();
    }

    const contentParts: string[] = firstLine ? [firstLine] : [];
    const optMap: Record<string, string> = {};
    const markedLetters: string[] = [];
    const styledCandidateLetters: { letter: string; underline: boolean; highlight: boolean; bold: boolean }[] = [];

    let answerLine = headerInlineAnswer;
    let explanationLines: string[] = [];
    let codeLines: string[] = [];
    let sampleSolutionLines: string[] = [];
    let section: 'content' | 'options' | 'explanation' | 'code' | 'solution' = 'content';

    const allowOptionParsing = explicitType !== 'essay';

    for (let i = 1; i < cleanLineObjs.length; i++) {
      const lineObj = cleanLineObjs[i];
      const line = lineObj.text;

      // Option line: optional leading marker (*, ✓, [x]) + A-D + optional * + . ) : + text
      const optRegex = isPracticalSubject
        ? /^(\*|✓|✔|\[[xX*]\]|\([xX*]\)|->)?\s*([A-D])\s*(\*)?\s*[.):]\s+(.+)$/
        : /^(\*|✓|✔|\[[xX*]\]|\([xX*]\)|->)?\s*([A-D])\s*(\*)?\s*[.):]\s+(.+)$/i;

      const optMatch = allowOptionParsing ? line.match(optRegex) : null;
      if (optMatch) {
        section = 'options';
        const letter = optMatch[2].toUpperCase();
        const cleanedOpt = cleanMarkedOptionText(optMatch[4]);
        optMap[letter] = cleanedOpt.text;

        if (optMatch[1] || optMatch[3] || cleanedOpt.isMarked) {
          markedLetters.push(letter);
        }

        styledCandidateLetters.push({
          letter,
          underline: Boolean(lineObj.isWholeUnderline),
          highlight: Boolean(lineObj.isWholeHighlighted),
          bold: Boolean(lineObj.isWholeBold),
        });
        continue;
      }

      // Sample solution code label
      const solCodeMatch = line.match(/^(?:Code\s*(?:mẫu|chuẩn)|Lời\s*giải\s*code|Sample\s*Solution)\s*[:\-]\s*(.*)$/i);
      if (solCodeMatch) {
        if (solCodeMatch[1].trim()) sampleSolutionLines.push(solCodeMatch[1].trim());
        section = 'solution';
        continue;
      }

      // Answer line
      const ansMatch = line.match(/^(?:Đáp án(?:\s*đúng)?|Dap an|ĐA|DA|Key|Answer|Chọn|Từ khóa(?:\s*chấm)?|Rubric)\s*[:\-]\s*(.*)$/i);
      if (ansMatch) {
        answerLine = ansMatch[1].trim();
        section = 'explanation';
        continue;
      }

      // Explanation line
      const expMatch = line.match(/^(?:Giải thích|Giai thich|Lời giải(?:\s*mẫu)?|Loi giai|Hướng dẫn(?:\s*giải)?|Huong dan)\s*[:\-]\s*(.*)$/i);
      if (expMatch) {
        if (expMatch[1].trim()) explanationLines.push(expMatch[1].trim());
        section = 'explanation';
        continue;
      }

      // Starter / prompt code snippet label
      const inlineCodeMatch = line.match(/^(?:Code|Mã nguồn(?:\s*gợi ý)?|Đoạn mã)\s*[:\-]\s*(.*)$/i);
      if (inlineCodeMatch) {
        if (inlineCodeMatch[1].trim()) codeLines.push(inlineCodeMatch[1].trim());
        section = 'code';
        continue;
      }

      if (section === 'solution') {
        sampleSolutionLines.push(line);
      } else if (section === 'code') {
        codeLines.push(line);
      } else if (section === 'explanation') {
        explanationLines.push(line);
      } else if (section === 'content') {
        contentParts.push(line);
      }
    }

    // If no explicit answer line or text marker, infer answer from Word underline / highlight / bold formatting
    if (!answerLine && markedLetters.length === 0 && styledCandidateLetters.length >= 2) {
      const underlined = styledCandidateLetters.filter(s => s.underline).map(s => s.letter);
      const highlighted = styledCandidateLetters.filter(s => s.highlight).map(s => s.letter);
      const bolded = styledCandidateLetters.filter(s => s.bold).map(s => s.letter);

      if (underlined.length > 0 && underlined.length < styledCandidateLetters.length) {
        markedLetters.push(...underlined);
      } else if (highlighted.length > 0 && highlighted.length < styledCandidateLetters.length) {
        markedLetters.push(...highlighted);
      } else if (bolded.length > 0 && bolded.length < styledCandidateLetters.length) {
        markedLetters.push(...bolded);
      }
    }

    // Fallback to trailing BẢNG ĐÁP ÁN section or table
    if (!answerLine && markedLetters.length === 0 && trailingAnswerKeyMap[questionNumber]) {
      answerLine = trailingAnswerKeyMap[questionNumber];
    } else if (!answerLine && markedLetters.length === 0 && trailingAnswerKeyMap[index + 1]) {
      answerLine = trailingAnswerKeyMap[index + 1];
    }

    if (!codeSnippet && codeLines.length > 0) {
      codeSnippet = codeLines.join('\n');
    }
    const sampleSolution = sampleSolutionLines.join('\n').trim();

    const optKeys = Object.keys(optMap);
    const hasOptions = isPracticalSubject ? optKeys.length >= 4 : optKeys.length >= 2;
    const questionType: QuestionType = explicitType || (hasOptions ? 'single_choice' : 'essay');

    const finalContent = contentParts.join('\n').trim();
    if (!finalContent) return;

    parsed.push(
      buildParsedDraftFromFields({
        tempId: makeTempId('imp_doc'),
        questionType,
        difficulty,
        content: finalContent,
        codeSnippet,
        sampleSolution,
        optA: optMap.A,
        optB: optMap.B,
        optC: optMap.C,
        optD: optMap.D,
        markedLetters,
        rawAns: answerLine,
        explanation: explanationLines.join('\n').trim(),
        points: points > 0 ? points : undefined,
        defaultChapterId,
        sourceLabel: 'file Word (.docx)',
      })
    );
  });

  const mappedTableQuestions = tableQuestions.map((q, idx) => {
    const qNum = idx + 1;
    if (!q.answerDetected && trailingAnswerKeyMap[qNum]) {
      const ids = extractAnswerOptIds(trailingAnswerKeyMap[qNum], q.options);
      if (ids.length > 0) {
        return {
          ...q,
          chapterId: defaultChapterId,
          correctAnswer: ids.length > 1 ? ids : ids[0],
          answerDetected: true,
          warnings: undefined,
        };
      }
    }
    return { ...q, chapterId: defaultChapterId };
  });

  const combined = [...mappedTableQuestions, ...parsed];

  if (combined.length === 0) {
    throw new Error('Không phân tích được câu hỏi nào từ file Word (.docx). Vui lòng đặt tiêu đề bắt đầu bằng "Câu 1:", "Bài 1:"...');
  }

  return combined;
}

export async function downloadSampleExcelTemplate(mode: 'theory' | 'practical' = 'theory') {
  const rows = mode === 'practical'
    ? [
        {
          'Loại': 'thuc_hanh',
          'Nội dung câu hỏi': 'Câu 1: Viết hàm kiểm tra số nguyên tố trong C/C++ và áp dụng in ra tất cả các số nguyên tố trong đoạn [1, N] với N nhập từ bàn phím.',
          'Đoạn mã': '#include <iostream>\nusing namespace std;\nbool laNguyenTo(int n) {\n    // Hoàn thiện hàm tại đây\n}',
          'Đáp án A': '',
          'Đáp án B': '',
          'Đáp án C': '',
          'Đáp án D': '',
          'Đáp án đúng': 'bool|sqrt|for|return|cout',
          'Giải thích': 'Dùng vòng lặp từ 2 đến căn bậc hai của n. Nếu n < 2 trả về false. Độ phức tạp O(N*sqrt(N)).',
          'Độ khó': 'medium',
          'Điểm': 5,
        },
        {
          'Loại': 'thuc_hanh',
          'Nội dung câu hỏi': 'Câu 2: Nhập mảng số nguyên gồm N phần tử. Sắp xếp mảng tăng dần và tìm phần tử xuất hiện nhiều nhất trong mảng.',
          'Đoạn mã': '#include <iostream>\n#include <algorithm>\nusing namespace std;\nint main() {\n    // Viết lời giải tại đây\n    return 0;\n}',
          'Đáp án A': '',
          'Đáp án B': '',
          'Đáp án C': '',
          'Đáp án D': '',
          'Đáp án đúng': 'sort|for|max|int|return',
          'Giải thích': 'Sắp xếp mảng bằng sort() hoặc thuật toán sắp xếp cơ bản, sau đó đếm tần suất liên tiếp để tìm phần tử xuất hiện nhiều nhất.',
          'Độ khó': 'hard',
          'Điểm': 5,
        },
      ]
    : [
        {
          'Loại': 'trac_nghiem',
          'Nội dung câu hỏi': 'Độ phức tạp thời gian của thuật toán tìm kiếm nhị phân (Binary Search) trên mảng đã sắp xếp là bao nhiêu?',
          'Đoạn mã': '',
          'Đáp án A': 'O(1)',
          'Đáp án B': 'O(log n)',
          'Đáp án C': 'O(n)',
          'Đáp án D': 'O(n^2)',
          'Đáp án đúng': 'B',
          'Giải thích': 'Mỗi bước tìm kiếm nhị phân chia đôi không gian tìm kiếm nên độ phức tạp là O(log n).',
          'Độ khó': 'easy',
          'Điểm': 1,
        },
        {
          'Loại': 'trac_nghiem',
          'Nội dung câu hỏi': 'Trong lập trình hướng đối tượng (OOP), tính chất nào cho phép lớp con kế thừa thuộc tính và phương thức từ lớp cha?',
          'Đoạn mã': '',
          'Đáp án A': 'Đóng gói (Encapsulation)',
          'Đáp án B': 'Đa hình (Polymorphism)',
          'Đáp án C': 'Kế thừa (Inheritance)',
          'Đáp án D': 'Trừu tượng (Abstraction)',
          'Đáp án đúng': 'C',
          'Giải thích': 'Kế thừa (Inheritance) cho phép xây dựng lớp mới dựa trên lớp đã có, tái sử dụng mã nguồn.',
          'Độ khó': 'easy',
          'Điểm': 1,
        },
      ];

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('NganHangCauHoi');

  if (rows.length > 0) {
    const headers = Object.keys(rows[0]);
    worksheet.addRow(headers);
    rows.forEach(r => {
      worksheet.addRow(headers.map(h => (r as any)[h] ?? ''));
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = mode === 'practical' ? 'mau_de_thi_thuc_hanh.xlsx' : 'mau_ngan_hang_cau_hoi_trac_nghiem.xlsx';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function downloadSampleWordTemplate(mode: 'theory' | 'practical' = 'theory') {
  const lines = mode === 'practical'
    ? [
        'NGÂN HÀNG CÂU HỎI THI THỰC HÀNH',
        '',
        'Câu 1: [Thực hành] (5 điểm) [Trung bình] Viết chương trình C++ quản lý danh sách sinh viên gồm Mã SV, Họ tên, Điểm TB. Thực hiện nhập danh sách N sinh viên và in ra sinh viên có điểm cao nhất.',
        'Code: struct SinhVien { string maSV; string hoTen; float dtb; };',
        'Đáp án: struct|SinhVien|for|max|cout',
        'Giải thích: Khai báo struct SinhVien, nhập mảng động hoặc vector, duyệt tuyến tính tìm max theo thuộc tính dtb.',
        '',
        'Câu 2: [Thực hành] (5 điểm) [Khó] Cài đặt thuật toán sắp xếp nhanh (QuickSort) hoặc sắp xếp trộn (MergeSort) để sắp xếp dãy số nguyên giảm dần và thống kê số lần hoán đổi.',
        'Đáp án: void|sort|partition|if|return',
        'Giải thích: Chia mảng theo phần tử chốt pivot, đệ quy trên hai nửa mảng con. Độ phức tạp trung bình O(n log n).',
      ]
    : [
        'NGÂN HÀNG CÂU HỎI TRẮC NGHIỆM (MẪU CHUẨN WORD .DOCX)',
        '',
        'Câu 1: [Dễ] Ngăn xếp (Stack) hoạt động theo nguyên tắc nào sau đây?',
        'A. FIFO (Vào trước ra trước)',
        'B. LIFO (Vào sau ra trước)',
        'C. Truy xuất ngẫu nhiên theo chỉ số',
        'D. Ưu tiên theo khóa nhỏ nhất',
        'Đáp án: B',
        'Giải thích: Ngăn xếp (Stack) luôn lấy ra phần tử được đưa vào sau cùng (Last In First Out).',
        '',
        'Câu 2: [Trung bình] Trong C++, từ khóa nào dùng để khai báo phương thức ảo phục vụ tính đa hình động?',
        'A. static',
        'B. const',
        'C. virtual',
        'D. inline',
        'Đáp án: C',
        'Giải thích: Từ khóa virtual cho phép cơ chế dynamic dispatch tại thời điểm chạy (runtime).',
      ];

  const doc = new Document({
    sections: [
      {
        children: lines.map(
          text =>
            new Paragraph({
              children: [new TextRun({ text, size: 24 })],
            })
        ),
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = mode === 'practical' ? 'mau_de_thuc_hanh_2_cau_10d.docx' : 'mau_ngan_hang_cau_hoi.docx';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function convertDraftToQuestionPayload(
  draft: ParsedQuestionDraft,
  subjectId: string,
  createdBy: string
): Omit<Question, 'id' | 'createdAt'> {
  return {
    subjectId,
    chapterId: draft.chapterId,
    questionType: draft.questionType,
    difficulty: draft.difficulty,
    content: draft.content,
    codeSnippet: draft.codeSnippet,
    sampleSolution: draft.sampleSolution,
    options: draft.options.length > 0 ? draft.options : undefined,
    correctAnswer: draft.correctAnswer,
    explanation: draft.explanation,
    points: draft.points,
    createdBy,
    sourceReference: 'Nhập từ ngân hàng câu hỏi (.docx / .xlsx)',
  };
}
