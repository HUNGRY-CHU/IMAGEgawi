import './site-header.css';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { getCroppedImg, compressImage, extensionFor, toClipboardPng, type OutputFormat } from './utils/cropImage';
import { centerCropAndCompress } from './utils/batchProcess';
import {
  UploadCloud,
  Download,
  Copy,
  RefreshCw,
  Archive,
  Layers,
  CheckCircle2,
  FileImage,
  X,
  Info
} from 'lucide-react';

type BatchResult = { blob: Blob; fileName: string; originalSize: number; targetBytes: number };

const formatSize = (bytes: number) => bytes >= 1024 * 1024
  ? `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  : `${(bytes / 1024).toFixed(1)} KB`;

const SIZE_OPTIONS = [
  { label: '100KB', value: 100 / 1024 },
  { label: '300KB', value: 300 / 1024 },
  { label: '500KB', value: 500 / 1024 },
  { label: '1MB', value: 1 },
  { label: '2MB', value: 2 },
];

function ImagePreview({ blob, fileName, onClose }: { blob: Blob; fileName: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [actualSize, setActualSize] = useState(false);

  useEffect(() => {
    const url = URL.createObjectURL(blob);
    if (imageRef.current) imageRef.current.src = url;
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [blob]);

  return (
    <dialog ref={dialogRef} onCancel={(event) => { event.preventDefault(); onClose(); }} aria-label="압축 결과 미리보기"
      className="m-auto w-[95vw] max-w-5xl rounded-2xl p-4 backdrop:bg-black/60">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="font-bold break-all">{fileName}</p>
          <p className="text-xs text-slate-500">{formatSize(blob.size)} · 작은 글자와 세부 표현을 확인하세요.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setActualSize(!actualSize)} className="px-3 py-2 rounded-lg bg-slate-100 text-sm">
            {actualSize ? '화면에 맞추기' : '실제 크기로 보기 (100%)'}
          </button>
          <button onClick={onClose} className="px-3 py-2 rounded-lg bg-slate-800 text-white text-sm">닫기</button>
        </div>
      </div>
      <div className="max-h-[75vh] overflow-auto bg-slate-100 rounded-lg">
        <img ref={imageRef} alt={`${fileName} 압축 결과`} className={actualSize ? 'max-w-none' : 'max-w-full max-h-[75vh] mx-auto object-contain'} />
      </div>
    </dialog>
  );
}

const ASPECT_RATIOS = [
  { label: '원본 비율 유지 (자르지 않기)', value: null },
  { label: '증명/프로필 (3:4)', value: 3 / 4 },
  { label: '모바일 세로 (9:16)', value: 9 / 16 },
  { label: '공문 활동사진 (4:3)', value: 4 / 3 },
  { label: '와이드 (16:9)', value: 16 / 9 },
  { label: '정사각형 (1:1)', value: 1 / 1 },
];

export default function App() {
  const [tab, setTab] = useState<'single' | 'batch'>('single');
  const [aspect, setAspect] = useState<number | null>(3 / 4);
  const [presetSizeMB, setPresetSizeMB] = useState<number>(300 / 1024);
  const [customSizeKB, setCustomSizeKB] = useState<string | null>(null);
  const targetSizeMB = customSizeKB === null ? presetSizeMB : Number(customSizeKB) / 1024;
  const validSize = Number.isFinite(targetSizeMB) && targetSizeMB >= 1 / 1024;
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('image/jpeg');
  const [jpegBackground, setJpegBackground] = useState('#ffffff');
  const [preview, setPreview] = useState<{ blob: Blob; fileName: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // --- 1장 정밀 모드 상태 ---
  const [singleImageSrc, setSingleImageSrc] = useState<string | null>(null);
  const [singleFileName, setSingleFileName] = useState<string>('image');
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isSingleProcessing, setIsSingleProcessing] = useState(false);
  const [singleResult, setSingleResult] = useState<{ url: string; blob: Blob; fileName: string; targetBytes: number } | null>(null);

  // --- 여러 장 일괄 모드 상태 ---
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [batchProgress, setBatchProgress] = useState(0);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [batchResults, setBatchResults] = useState<BatchResult[]>([]);
  const [isZipProcessing, setIsZipProcessing] = useState(false);

  const busy = isSingleProcessing || isBatchProcessing || isZipProcessing;

  useEffect(() => {
    if (!singleResult) return;
    return () => URL.revokeObjectURL(singleResult.url);
  }, [singleResult]);

  // 드래그 앤 드롭 공통 핸들러
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (busy) return;

    const droppedFiles = Array.from(e.dataTransfer.files).filter((file) =>
      file.type.startsWith('image/')
    );

    if (droppedFiles.length === 0) return;

    if (droppedFiles.length === 1 && tab === 'single') {
      loadSingleFile(droppedFiles[0]);
    } else {
      setTab('batch');
      setBatchFiles((prev) => [...prev, ...droppedFiles]);
      setBatchResults([]);
    }
  };

  // 1장 파일 읽기
  const loadSingleFile = (file: File) => {
    const baseName = file.name.replace(/\.[^/.]+$/, '');
    setSingleFileName(baseName);

    const reader = new FileReader();
    reader.addEventListener('load', () => {
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
      setSingleImageSrc(reader.result as string);
      setSingleResult(null);
    });
    reader.readAsDataURL(file);
  };

  const handleSingleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      if (e.target.files.length > 1) {
        setTab('batch');
        setBatchFiles(Array.from(e.target.files).filter(f => f.type.startsWith('image/')));
        setBatchResults([]);
      } else {
        loadSingleFile(e.target.files[0]);
      }
    }
  };

  const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  // 1장 크롭 및 압축
  const handleSingleProcess = async () => {
    if (!singleImageSrc || (aspect !== null && !croppedAreaPixels) || !validSize || busy) return;
    setIsSingleProcessing(true);
    try {
      const croppedBlob = await getCroppedImg(singleImageSrc, aspect === null ? null : croppedAreaPixels, outputFormat, jpegBackground);
      const finalBlob = await compressImage(croppedBlob, targetSizeMB, outputFormat);
      const url = URL.createObjectURL(finalBlob);

      setSingleResult({
        url,
        blob: finalBlob,
        fileName: `${singleFileName}_resized.${extensionFor(outputFormat)}`,
        targetBytes: targetSizeMB * 1024 * 1024,
      });
    } catch {
      alert('이미지 처리 중 오류가 발생했습니다.');
    } finally {
      setIsSingleProcessing(false);
    }
  };

  // 클립보드 복사 (Ctrl+V)
  const copyToClipboard = async () => {
    if (!singleResult) return;
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': toClipboardPng(singleResult.blob) }),
      ]);
      alert('클립보드에 복사되었습니다! 공문서에 Ctrl+V로 붙여넣으세요.');
    } catch {
      alert('클립보드 복사를 지원하지 않는 브라우저입니다. 다운로드 버튼을 이용해 주세요.');
    }
  };

  // 변환 결과를 보관하여 개별 저장과 ZIP 저장에 함께 사용합니다.
  const handleBatchProcess = async () => {
    if (batchFiles.length === 0 || busy || !validSize) return;
    setIsBatchProcessing(true);
    setBatchProgress(0);
    setBatchResults([]);

    const results: BatchResult[] = [];
    const usedNames = new Set<string>();
    try {
      for (let i = 0; i < batchFiles.length; i++) {
        const file = batchFiles[i];
        const { blob, fileName } = await centerCropAndCompress(file, aspect, targetSizeMB, outputFormat, jpegBackground);
        const baseName = fileName.replace(/\.[^.]+$/, '');
        let uniqueName = fileName;
        let suffix = 2;
        while (usedNames.has(uniqueName.toLowerCase())) {
          uniqueName = `${baseName}_${suffix++}.${extensionFor(outputFormat)}`;
        }
        usedNames.add(uniqueName.toLowerCase());
        results.push({ blob, fileName: uniqueName, originalSize: file.size, targetBytes: targetSizeMB * 1024 * 1024 });
        setBatchProgress(Math.round(((i + 1) / batchFiles.length) * 100));
      }
      setBatchResults(results);
    } catch {
      alert('일괄 압축 도중 오류가 발생했습니다. 다시 시도해 주세요.');
    } finally {
      setIsBatchProcessing(false);
    }
  };

  const downloadBatchZip = async () => {
    if (batchResults.length === 0 || isZipProcessing) return;
    setIsZipProcessing(true);
    try {
      const zip = new JSZip();
      batchResults.forEach(({ fileName, blob }) => zip.file(fileName, blob));
      saveAs(await zip.generateAsync({ type: 'blob' }), `images_resized_${Date.now()}.zip`);
    } catch {
      alert('ZIP 파일 생성에 실패했습니다. 개별 다운로드를 이용하거나 다시 시도해 주세요.');
    } finally {
      setIsZipProcessing(false);
    }
  };

  return (
    <div
      className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* 헤더 */}
      <header className="gawi-header">
        <div>
          <h1>이미지 가위</h1>
          <p>원하는 비율로 자르고, 필요한 용량으로 압축하세요</p>
        </div>
        <nav className="tool-tabs" aria-label="변환 도구">
          <button aria-pressed={tab === 'single'} disabled={busy} onClick={() => setTab('single')}>
            1장 정밀 크롭
          </button>
          <button aria-pressed={tab === 'batch'} disabled={busy} onClick={() => setTab('batch')}>
            여러 장 일괄 변환
          </button>
        </nav>
        <div className="gawi-header-actions">
          <nav className="gawi-nav" aria-label="가위 도구">
            <a href="/" aria-current="page">이미지 가위</a>
            <a href="https://pdf.gawi.cc/">PDF 가위</a>
          </nav>
          <span className="gawi-privacy">
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s7-3 7-9V5l-7-3-7 3v8c0 6 7 9 7 9Z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
            서버 전송 없음
          </span>
        </div>
      </header>

      <main className="gawi-main flex-1 max-w-5xl w-full mx-auto p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* 좌측: 작업 영역 */}
        <div className="md:col-span-2 flex flex-col bg-white p-4 rounded-2xl border border-slate-200 shadow-xs min-h-[480px]">
          {tab === 'single' ? (
            /* 1장 모드 */
            !singleImageSrc ? (
              <label className={`flex-1 border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition ${
                isDragging ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-300 hover:bg-slate-50'
              }`}>
                <UploadCloud className="w-12 h-12 text-slate-400 mb-2" />
                <span className="font-semibold text-slate-700">용량을 줄일 이미지를 끌어다 놓으세요</span>
                <span className="text-xs text-slate-400 mt-1">또는 클릭하여 파일 선택 (여러 장 선택 시 일괄 모드로 자동 전환)</span>
                <input type="file" disabled={busy} accept="image/*" multiple onChange={handleSingleFileInput} className="hidden" />
              </label>
            ) : (
              <div className="flex-1 flex flex-col">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold text-slate-600">{aspect === null ? '전체 이미지를 자르지 않고 압축합니다' : '위치를 드래그하여 맞추세요'}</span>
                  <button
                    disabled={busy}
                    onClick={() => { setSingleImageSrc(null); setSingleResult(null); }}
                    className="text-xs text-rose-500 hover:underline flex items-center gap-1"
                  >
                    <X className="w-3.5 h-3.5" /> 다른 사진 선택
                  </button>
                </div>
                <div className="relative w-full h-[380px] bg-slate-950 rounded-xl overflow-hidden">
                  {aspect === null ? (
                    <img src={singleImageSrc} alt="압축할 원본 이미지" className="w-full h-full object-contain" />
                  ) : <Cropper
                    image={singleImageSrc}
                    crop={crop}
                    zoom={zoom}
                    aspect={aspect}
                    onCropChange={setCrop}
                    onCropComplete={onCropComplete}
                    onZoomChange={setZoom}
                  />}
                </div>
                {aspect !== null && <div className="mt-4 flex items-center gap-3">
                  <span className="text-xs font-medium text-slate-500">확대</span>
                  <input
                    type="range"
                    value={zoom}
                    min={1}
                    max={3}
                    step={0.1}
                    onChange={(e) => setZoom(Number(e.target.value))}
                    disabled={busy}
                    className="flex-1 accent-indigo-600 cursor-pointer"
                  />
                </div>}
              </div>
            )
          ) : (
            /* 여러 장 모드 */
            <div className="flex-1 flex flex-col gap-4">
              {/* 중앙 기준 자동 크롭 안내 문구 */}
              <div className="flex items-center gap-2 px-3.5 py-2.5 bg-indigo-50/70 border border-indigo-100 rounded-xl text-xs text-indigo-800 font-medium">
                <Info className="w-4 h-4 flex-shrink-0 text-indigo-600" />
                <span>{aspect === null ? '각 사진의 원본 비율을 유지하며 자르지 않고 압축합니다.' : '가로·세로 사진 모두 중앙을 기준으로 선택한 비율에 맞춰 자릅니다.'}</span>
              </div>

              <label className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition ${
                isDragging ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-300 hover:bg-slate-50'
              }`}>
                <UploadCloud className="w-12 h-12 text-slate-400 mb-2" />
                <span className="font-semibold text-slate-700">여러 장의 사진들을 한 번에 끌어다 놓으세요</span>
                <span className="text-xs text-slate-400 mt-1">파일들을 계속 추가할 수 있습니다</span>
                <input
                  type="file"
                  disabled={busy}
                  accept="image/*"
                  multiple
                  onChange={(e) => {
                    if (e.target.files) {
                      setBatchFiles((prev) => [...prev, ...Array.from(e.target.files!).filter(file => file.type.startsWith('image/'))]);
                      setBatchResults([]);
                    }
                  }}
                  className="hidden"
                />
              </label>

              {/* 선택된 파일 목록 요약 */}
              {batchFiles.length > 0 && (
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <FileImage className="w-4 h-4 text-indigo-600" />
                    <span className="text-xs font-bold text-slate-700">
                      총 <strong className="text-indigo-600">{batchFiles.length}</strong>개 사진 등록됨
                    </span>
                  </div>
                  <button
                    disabled={busy}
                    onClick={() => { setBatchFiles([]); setBatchResults([]); }}
                    className="text-xs text-slate-400 hover:text-rose-500 underline"
                  >
                    목록 비우기
                  </button>
                </div>
              )}

              {batchFiles.length > 0 && (
                <ul aria-label="선택한 사진" className="divide-y divide-slate-200 border border-slate-200 rounded-xl">
                  {batchFiles.map((file, index) => (
                    <li key={`${file.name}-${index}`} className="flex items-center gap-3 justify-between p-3 text-xs">
                      <span className="min-w-0 break-all">{file.name} · {formatSize(file.size)}</span>
                      <button disabled={busy} aria-label={`${file.name} ${index + 1}번 사진 삭제`}
                        className="shrink-0 text-rose-600 disabled:opacity-50"
                        onClick={() => {
                          setBatchFiles(files => files.filter((_, i) => i !== index));
                          setBatchResults([]);
                        }}>삭제</button>
                    </li>
                  ))}
                </ul>
              )}

              {/* 진행률 바 */}
              {isBatchProcessing && (
                <div className="flex flex-col gap-1.5 mt-2">
                  <div className="flex justify-between text-xs text-slate-600 font-semibold">
                    <span>사진 압축 중...</span>
                    <span>{batchProgress}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300"
                      style={{ width: `${batchProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {batchResults.length > 0 && (
                <div className="flex flex-col gap-3" aria-live="polite">
                  <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-xl">
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                    <span>{batchResults.length}개 사진 압축 완료! 개별 다운로드하거나 ZIP으로 저장하세요.</span>
                  </div>
                  <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200">
                    {batchResults.map((result) => (
                      <li key={result.fileName} className="flex flex-wrap items-center justify-between gap-3 p-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-slate-700 break-all">{result.fileName}</p>
                          <p className="text-xs text-slate-500 mt-1">
                            {formatSize(result.originalSize)} → {formatSize(result.blob.size)}
                            {' · '}{result.blob.size <= result.originalSize
                              ? `${Math.round((1 - result.blob.size / result.originalSize) * 100)}% 감소`
                              : `${Math.round((result.blob.size / result.originalSize - 1) * 100)}% 증가`}
                          </p>
                          {result.blob.size > result.targetBytes && <p className="text-xs text-amber-700 mt-1">목표 용량 초과: 용량을 높이거나 JPEG로 다시 변환하세요.</p>}
                        </div>
                        <button
                          onClick={() => setPreview({ blob: result.blob, fileName: result.fileName })}
                          aria-label={`${result.fileName} 미리보기`}
                          className="px-3 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 rounded-lg hover:bg-indigo-100"
                        >미리보기</button>
                        <button
                          onClick={() => saveAs(result.blob, result.fileName)}
                          aria-label={`${result.fileName} 다운로드`}
                          className="flex items-center gap-1 px-3 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100"
                        >
                          <Download className="w-3.5 h-3.5" /> 다운로드
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 우측: 설정 컨트롤러 */}
        <div className="flex flex-col gap-6">
          <fieldset disabled={busy} className="flex flex-col gap-6">
          {/* 비율 선택 */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <h3 className="settings-title"><span>01</span> 사진 비율</h3>
            <div className="grid grid-cols-1 gap-2">
              {ASPECT_RATIOS.map((item) => (
                <button
                  key={item.label}
                  onClick={() => setAspect(item.value)}
                  className={`text-left px-3 py-2 text-xs rounded-xl font-medium transition ${
                    aspect === item.value
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* 목표 용량 선택 */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <h3 className="settings-title"><span>02</span> 사진당 최대 용량</h3>
            <div className="grid grid-cols-3 gap-2">
              {SIZE_OPTIONS.map(({ label, value: mb }) => (
                <button
                  key={mb}
                  onClick={() => { setPresetSizeMB(mb); setCustomSizeKB(null); }}
                  className={`flex-1 py-1.5 text-xs rounded-lg font-medium border transition ${
                    customSizeKB === null && targetSizeMB === mb
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700 font-semibold'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="block text-xs text-slate-600 mt-3">
              목표 용량 직접 입력 (KB)
              <input type="number" min="1" step="1" value={customSizeKB ?? ''} placeholder="예: 200"
                onChange={event => setCustomSizeKB(event.target.value)}
                className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2" />
            </label>
            {!validSize && <p role="alert" className="text-xs text-rose-600 mt-2">1KB 이상의 올바른 용량을 입력하세요.</p>}
            {validSize && targetSizeMB <= 100 / 1024 && (
              <p className="mt-3 text-xs text-amber-700" role="status">100KB 이하에서는 작은 글자·세부 표현이 흐려질 수 있어요. 압축 후 미리보기로 확인하세요.</p>
            )}
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <h3 className="settings-title"><span>03</span> 다운로드 형식</h3>
            <div className="flex gap-2">
              {(['image/jpeg', 'image/png'] as const).map(format => (
                <button key={format} aria-pressed={outputFormat === format} onClick={() => setOutputFormat(format)}
                  className={`flex-1 py-2 rounded-lg text-xs border ${outputFormat === format ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600'}`}>
                  {format === 'image/jpeg' ? 'JPEG (기본)' : 'PNG'}
                </button>
              ))}
            </div>
            {outputFormat === 'image/jpeg' ? (
              <label className="flex items-center justify-between gap-2 mt-3 text-xs text-slate-600">
                투명 영역 배경색
                <input aria-label="JPEG 배경색" type="color" value={jpegBackground} onChange={event => setJpegBackground(event.target.value)} />
              </label>
            ) : <p className="text-xs text-slate-600 mt-3">투명 배경을 유지합니다. 작은 목표 용량에서는 해상도가 낮아지거나 목표 용량을 초과할 수 있어요.</p>}
            {outputFormat === 'image/jpeg' && <p className="text-xs text-slate-500 mt-2">JPEG는 투명 배경을 지원하지 않아 선택한 색으로 채웁니다.</p>}
            <p className="text-xs text-slate-500 mt-2">설정을 바꾼 뒤에는 다시 변환하세요. 압축 시 긴 변은 최대 1920px로 줄어듭니다.</p>
          </div>
          </fieldset>

          {/* 동작 버튼 */}
          {tab === 'single' ? (
            <>
              <button
                disabled={!singleImageSrc || busy || !validSize || (aspect !== null && !croppedAreaPixels)}
                onClick={handleSingleProcess}
                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold rounded-xl shadow-xs transition flex items-center justify-center gap-2 cursor-pointer"
              >
                {isSingleProcessing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> 압축 중...
                  </>
                ) : (
                  aspect === null ? '자르지 않고 압축하기' : '자르기 & 압축하기'
                )}
              </button>

              {singleResult && (
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col gap-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-slate-600">완료된 용량:</span>
                    <span className={`font-bold text-sm ${singleResult.blob.size > singleResult.targetBytes ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {formatSize(singleResult.blob.size)}
                    </span>
                  </div>

                  {singleResult.blob.size > singleResult.targetBytes && <p className="text-xs text-amber-700">목표 용량을 초과했습니다. 용량을 높이거나 JPEG로 다시 변환하세요.</p>}
                  <button
                    onClick={() => setPreview({ blob: singleResult.blob, fileName: singleResult.fileName })}
                    className="w-full py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-xl"
                  >압축 결과 미리보기</button>
                  <div className="flex gap-2">
                    <button
                      onClick={copyToClipboard}
                      className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" /> 복사 (Ctrl+V)
                    </button>
                    <a
                      href={singleResult.url}
                      download={singleResult.fileName}
                      className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 shadow-xs transition text-center"
                    >
                      <Download className="w-3.5 h-3.5 inline mr-1" /> 다운로드
                    </a>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
            <button
              disabled={batchFiles.length === 0 || busy || !validSize}
              onClick={handleBatchProcess}
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold rounded-xl shadow-xs transition flex items-center justify-center gap-2 cursor-pointer"
            >
              {isBatchProcessing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> 일괄 처리 중 ({batchProgress}%)
                </>
              ) : (
                <>
                  <Layers className="w-4 h-4" /> 일괄 변환하기
                </>
              )}
            </button>
            {batchResults.length > 0 && (
              <button
                onClick={downloadBatchZip}
                disabled={isZipProcessing || isBatchProcessing}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl flex items-center justify-center gap-2"
              >
                <Archive className="w-4 h-4" /> {isZipProcessing ? 'ZIP 생성 중...' : '전체 ZIP 다운로드'}
              </button>
            )}
            </>
          )}
        </div>
      </main>
      {preview && <ImagePreview blob={preview.blob} fileName={preview.fileName} onClose={() => setPreview(null)} />}
    </div>
  );
}
