import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { BlueprintPreview } from '@/components/BlueprintPreview';
import { CutListCard } from '@/components/CutListCard';
import { Header, type WorkspaceTab } from '@/components/Header';
import { SidebarControls } from '@/components/SidebarControls';
import { calculateCaseGeometry } from '@/core/geometry';
import { generateInnerTemplatesPdf } from '@/core/pdfExport';
import {
  clearProjectStorage,
  loadProjectFromStorage,
  saveProjectToStorage,
  triggerBytesDownload,
  triggerTextDownload,
} from '@/core/storage';
import { generateOuterWrapSvg } from '@/core/svgExport';
import { BookParametersModel, type BookParameters } from '@/types/bookParams';
import { BookbinderProjectModel, type BookbinderProject } from '@/types/project';
import { CoverStudioModel, type CoverStudioState } from '@/types/studio';

const CoverStyler = lazy(async () => {
  const mod = await import('@/studio/CoverStyler');
  return { default: mod.CoverStyler };
});

export function App() {
  const [project, setProject] = useState<BookbinderProject>(() => loadProjectFromStorage());
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('templates');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const geometry = useMemo(
    () => calculateCaseGeometry(project.parameters),
    [project.parameters],
  );

  useEffect(() => {
    const result = saveProjectToStorage(project);
    if (result.omittedImageForQuota) {
      setStatusMessage('Settings saved (cover image too large for localStorage)');
    }
  }, [project]);

  const handleParamsChange = (parameters: BookParameters) => {
    setProject((prev) => ({
      ...prev,
      updatedAt: new Date().toISOString(),
      parameters,
    }));
  };

  const handleStudioChange = (studio: CoverStudioState) => {
    setProject((prev) => ({
      ...prev,
      updatedAt: new Date().toISOString(),
      studio,
    }));
  };

  const handleDownloadSvg = () => {
    const svg = generateOuterWrapSvg(geometry, project.parameters.splitMode);
    const filename =
      project.parameters.splitMode === 'three-piece'
        ? 'outer_case_wrap_3piece.svg'
        : 'outer_case_wrap.svg';
    triggerTextDownload(svg, filename, 'image/svg+xml;charset=utf-8');
    setStatusMessage(`Exported ${filename}`);
  };

  const handleDownloadPdf = async () => {
    setIsExportingPdf(true);
    try {
      const { bytes, plan } = await generateInnerTemplatesPdf(
        geometry,
        project.parameters.pdfPageSize,
      );
      triggerBytesDownload(bytes, 'inner_pockets_and_liner.pdf', 'application/pdf');
      setStatusMessage(
        `Exported inner_pockets_and_liner.pdf (${plan.pageCount} ${plan.pageCount === 1 ? 'page' : 'pages'})`,
      );
    } catch {
      setStatusMessage('Failed to generate inner templates PDF.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleExportJson = () => {
    const json = BookbinderProjectModel.toJson(project);
    const fileName = BookbinderProjectModel.suggestFileName(
      project.name,
      project.studio.spineText.title,
    );
    triggerTextDownload(json, fileName, 'application/json;charset=utf-8');
    setStatusMessage(`Saved ${fileName}`);
  };

  const handleImportJson = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = BookbinderProjectModel.fromJson(text);
      if (!parsed.ok) {
        setStatusMessage(`Import error: ${parsed.error}`);
        return;
      }
      setProject(parsed.project);
      setStatusMessage(`Loaded ${file.name}`);
    } catch {
      setStatusMessage('Could not read selected project file.');
    }
  };

  const handleResetDefaults = () => {
    clearProjectStorage();
    setProject(
      BookbinderProjectModel.create(
        BookParametersModel.createDefault(),
        CoverStudioModel.createDefault(),
      ),
    );
    setStatusMessage('Reset to default dimensions');
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        statusMessage={statusMessage}
      />

      <main
        id="main-workspace"
        tabIndex={-1}
        className="mx-auto grid max-w-[1520px] grid-cols-1 gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[310px_1fr]"
      >
        <SidebarControls
          params={project.parameters}
          onChange={handleParamsChange}
          onExportJson={handleExportJson}
          onImportJson={handleImportJson}
          onResetDefaults={handleResetDefaults}
        />

        <div className="flex min-w-0 flex-col gap-5">
          <CutListCard geometry={geometry} unit={project.parameters.unit} />

          {activeTab === 'templates' ? (
            <BlueprintPreview
              geometry={geometry}
              splitMode={project.parameters.splitMode}
              pdfPageSize={project.parameters.pdfPageSize}
              unit={project.parameters.unit}
              isExportingPdf={isExportingPdf}
              onDownloadSvg={handleDownloadSvg}
              onDownloadPdf={handleDownloadPdf}
            />
          ) : (
            <Suspense
              fallback={
                <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
                  Loading Cover &amp; Spine Styler…
                </div>
              }
            >
              <CoverStyler
                geometry={geometry}
                studio={project.studio}
                onChange={handleStudioChange}
                onStatusMessage={setStatusMessage}
              />
            </Suspense>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
