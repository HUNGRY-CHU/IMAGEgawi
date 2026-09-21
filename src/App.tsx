import React, { useState, useCallback } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { getCroppedImg, compressImage } from './utils/cropImage';
import { centerCropAndCompress } from './utils/batchProcess';
import {
  UploadCloud,
  Download,
  Copy,
  ShieldCheck,
  RefreshCw,
  Archive,
  Layers,
  Crop as CropIcon,
  CheckCircle2,
  FileImage,
  X,
  Info
} from 'lucide-react';

const ASPECT_RATIOS = [
  { label: '증명/프로필 (3:4)', value: 3 / 4 },
  { label: '모바일 세로 (9:16)', value: 9 / 16 },
  { label: '공문 활동사진 (4:3)', value: 4 / 3 },
  { label: '와이드 (16:9)', value: 16 / 9 },
  { label: '정사각형 (1:1)', value: 1 / 1 },
];

export default function App() {
  const [tab, setTab] = useState<'single' | 'batch'>('single');
  const [aspect, setAspect] = useState<number>(3 / 4);
  const [targetSizeMB, setTargetSizeMB] = useState<number>(1);
  const [isDragging, setIsDragging] = useState(false);

  // --- 1장 정밀 모드 상태 ---
  const [singleImageSrc, setSingleImageSrc] = useState<string | null>(null);
  const [singleFileName, setSingleFileName] = useState<string>('image');
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isSingleProcessing, setIsSingleProcessing] = useState(false);
  const [singleResult, setSingleResult] = useState<{ sizeKB: number; url: string; blob: Blob } | null>(null);

  // --- 여러 장 일괄 모드 상태 ---
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [batchProgress, setBatchProgress] = useState(0);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [isBatchCompleted, setIsBatchCompleted] = useState(false);

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

    const droppedFiles = Array.from(e.dataTransfer.files).filter((file) =>
      file.type.startsWith('image/')
    );

    if (droppedFiles.length === 0) return;

    if (droppedFiles.length === 1 && tab === 'single') {
      loadSingleFile(droppedFiles[0]);
    } else {
      setTab('batch');
      setBatchFiles((prev) => [...prev, ...droppedFiles]);
      setIsBatchCompleted(false);
    }
  };

  // 1장 파일 읽기
  const loadSingleFile = (file: File) => {
    const baseName = file.name.replace(/\.[^/.]+$/, '');
    setSingleFileName(baseName);

    const reader = new FileReader();
    reader.addEventListener('load', () => {
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
        setIsBatchCompleted(false);
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
    if (!singleImageSrc || !croppedAreaPixels) return;
    setIsSingleProcessing(true);
    try {
      const croppedBlob = await getCroppedImg(singleImageSrc, croppedAreaPixels);
      const finalBlob = await compressImage(croppedBlob, targetSizeMB);
      const url = URL.createObjectURL(finalBlob);

      setSingleResult({
        sizeKB: Math.round(finalBlob.size / 1024),
        url,
        blob: finalBlob,
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
      const pngBlob = new Blob([singleResult.blob], { type: 'image/png' });
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': pngBlob }),
      ]);
      alert('클립보드에 복사되었습니다! 공문서에 Ctrl+V로 붙여넣으세요.');
    } catch {
      alert('클립보드 복사를 지원하지 않는 브라우저입니다. 다운로드 버튼을 이용해 주세요.');
    }
  };

  // 여러 장 일괄 압축 및 ZIP 다운로드
  const handleBatchProcess = async () => {
    if (batchFiles.length === 0) return;
    setIsBatchProcessing(true);
    setBatchProgress(0);
    setIsBatchCompleted(false);

    const zip = new JSZip();

    try {
      for (let i = 0; i < batchFiles.length; i++) {
        const file = batchFiles[i];
        const { blob, fileName } = await centerCropAndCompress(file, aspect, targetSizeMB);
        zip.file(fileName, blob);
        setBatchProgress(Math.round(((i + 1) / batchFiles.length) * 100));
      }

      const zipContent = await zip.generateAsync({ type: 'blob' });
      saveAs(zipContent, `images_resized_${Date.now()}.zip`);
      setIsBatchCompleted(true);
    } catch {
      alert('일괄 압축 도중 오류가 발생했습니다.');
    } finally {
      setIsBatchProcessing(false);
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
      <header className="bg-white border-b border-slate-200 py-3.5 px-6 flex justify-between items-center shadow-xs">
        <div>
          <h1 className="text-xl font-bold text-slate-900">공문 사진 다이어트</h1>
          <p className="text-xs text-slate-500">1MB 이하 자동 압축 & 공문 서식 규격 비율 크롭</p>
        </div>
        <div className="flex items-center text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-full font-medium">
          <ShieldCheck className="w-4 h-4 mr-1.5" />
          서버 전송 없음 (100% 브라우저 내 안전 처리)
        </div>
      </header>

      {/* 모드 전환 탭 */}
      <div className="max-w-5xl w-full mx-auto px-6 pt-5">
        <div className="flex bg-slate-200 p-1 rounded-xl w-fit">
          <button
            onClick={() => setTab('single')}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition ${
              tab === 'single' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CropIcon className="w-3.5 h-3.5" /> 1장 정밀 크롭
          </button>
          <button
            onClick={() => setTab('batch')}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition ${
              tab === 'batch' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" /> 여러 장 일괄 변환 (ZIP)
          </button>
        </div>
      </div>

      <main className="flex-1 max-w-5xl w-full mx-auto p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* 좌측: 작업 영역 */}
        <div className="md:col-span-2 flex flex-col bg-white p-4 rounded-2xl border border-slate-200 shadow-xs min-h-[480px]">
          {tab === 'single' ? (
            /* 1장 모드 */
            !singleImageSrc ? (
              <label className={`flex-1 border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition ${
                isDragging ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-300 hover:bg-slate-50'
              }`}>
                <UploadCloud className="w-12 h-12 text-slate-400 mb-2" />
                <span className="font-semibold text-slate-700">공문에 넣을 사진을 끌어다 놓으세요</span>
                <span className="text-xs text-slate-400 mt-1">또는 클릭하여 파일 선택 (여러 장 선택 시 일괄 모드로 자동 전환)</span>
                <input type="file" accept="image/*" multiple onChange={handleSingleFileInput} className="hidden" />
              </label>
            ) : (
              <div className="flex-1 flex flex-col">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold text-slate-600">위치를 드래그하여 맞추세요</span>
                  <button
                    onClick={() => { setSingleImageSrc(null); setSingleResult(null); }}
                    className="text-xs text-rose-500 hover:underline flex items-center gap-1"
                  >
                    <X className="w-3.5 h-3.5" /> 다른 사진 선택
                  </button>
                </div>
                <div className="relative w-full h-[380px] bg-slate-950 rounded-xl overflow-hidden">
                  <Cropper
                    image={singleImageSrc}
                    crop={crop}
                    zoom={zoom}
                    aspect={aspect}
                    onCropChange={setCrop}
                    onCropComplete={onCropComplete}
                    onZoomChange={setZoom}
                  />
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <span className="text-xs font-medium text-slate-500">확대</span>
                  <input
                    type="range"
                    value={zoom}
                    min={1}
                    max={3}
                    step={0.1}
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="flex-1 accent-indigo-600 cursor-pointer"
                  />
                </div>
              </div>
            )
          ) : (
            /* 여러 장 모드 */
            <div className="flex-1 flex flex-col gap-4">
              {/* 중앙 기준 자동 크롭 안내 문구 */}
              <div className="flex items-center gap-2 px-3.5 py-2.5 bg-indigo-50/70 border border-indigo-100 rounded-xl text-xs text-indigo-800 font-medium">
                <Info className="w-4 h-4 flex-shrink-0 text-indigo-600" />
                <span>화면 중앙을 기준으로 자동 크롭됩니다.</span>
              </div>

              <label className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition ${
                isDragging ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-300 hover:bg-slate-50'
              }`}>
                <UploadCloud className="w-12 h-12 text-slate-400 mb-2" />
                <span className="font-semibold text-slate-700">여러 장의 사진들을 한 번에 끌어다 놓으세요</span>
                <span className="text-xs text-slate-400 mt-1">파일들을 계속 추가할 수 있습니다</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => {
                    if (e.target.files) {
                      setBatchFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
                      setIsBatchCompleted(false);
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
                    onClick={() => { setBatchFiles([]); setIsBatchCompleted(false); }}
                    className="text-xs text-slate-400 hover:text-rose-500 underline"
                  >
                    목록 비우기
                  </button>
                </div>
              )}

              {/* 진행률 바 */}
              {isBatchProcessing && (
                <div className="flex flex-col gap-1.5 mt-2">
                  <div className="flex justify-between text-xs text-slate-600 font-semibold">
                    <span>압축 및 패키징 중...</span>
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

              {isBatchCompleted && (
                <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-xl">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>모든 사진 압축 완료! ZIP 파일이 즉시 다운로드되었습니다.</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 우측: 설정 컨트롤러 */}
        <div className="flex flex-col gap-5">
          {/* 비율 선택 */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <h3 className="text-sm font-bold text-slate-700 mb-3">1. 사진 비율</h3>
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
            <h3 className="text-sm font-bold text-slate-700 mb-3">2. 사진당 최대 용량</h3>
            <div className="flex gap-2">
              {[0.5, 1, 2].map((mb) => (
                <button
                  key={mb}
                  onClick={() => setTargetSizeMB(mb)}
                  className={`flex-1 py-1.5 text-xs rounded-lg font-medium border transition ${
                    targetSizeMB === mb
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700 font-semibold'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                  }`}
                >
                  {mb >= 1 ? `${mb}MB` : `${mb * 1000}KB`}
                </button>
              ))}
            </div>
          </div>

          {/* 동작 버튼 */}
          {tab === 'single' ? (
            <>
              <button
                disabled={!singleImageSrc || isSingleProcessing}
                onClick={handleSingleProcess}
                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold rounded-xl shadow-xs transition flex items-center justify-center gap-2 cursor-pointer"
              >
                {isSingleProcessing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> 압축 중...
                  </>
                ) : (
                  '자르기 & 압축하기'
                )}
              </button>

              {singleResult && (
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col gap-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-slate-600">완료된 용량:</span>
                    <span className={`font-bold text-sm ${singleResult.sizeKB > targetSizeMB * 1024 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {singleResult.sizeKB} KB
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={copyToClipboard}
                      className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" /> 복사 (Ctrl+V)
                    </button>
                    <a
                      href={singleResult.url}
                      download={`${singleFileName}_resized.jpg`}
                      className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 shadow-xs transition text-center"
                    >
                      <Download className="w-3.5 h-3.5 inline mr-1" /> 다운로드
                    </a>
                  </div>
                </div>
              )}
            </>
          ) : (
            <button
              disabled={batchFiles.length === 0 || isBatchProcessing}
              onClick={handleBatchProcess}
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold rounded-xl shadow-xs transition flex items-center justify-center gap-2 cursor-pointer"
            >
              {isBatchProcessing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> 일괄 처리 중 ({batchProgress}%)
                </>
              ) : (
                <>
                  <Archive className="w-4 h-4" /> 일괄 변환 후 ZIP 다운로드
                </>
              )}
            </button>
          )}
        </div>
      </main>
    </div>
  );
}