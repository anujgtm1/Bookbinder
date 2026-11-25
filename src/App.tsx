import { BookMarked, CheckCircle2, FolderOpen, Ruler } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Header } from '@/components/Header';
import { MeasureAndCutPanel } from '@/components/MeasureAndCutPanel';
import type {
  InnerPdfExportOptions,
  OuterPdfExportOptions,
} from '@/components/PdfExportDialog';
import { SidebarControls } from '@/components/SidebarControls';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { resolveBindingStrategy } from '@/core/bindingStyles';
import { calculateCaseGeometry } from '@/core/geometry';
import { generateInnerTemplatesPdf, generateOuterWrapPdf } from '@/core/pdfExport';
import {
  clearProjectStorage,
  loadProjectFromStorage,
  saveProjectToStorage,
  triggerBytesDownload,
  triggerTextDownload,
} from '@/core/storage';
import { generateInnerTemplatesSvg, generateOuterWrapSvg } from '@/core/svgExport';
import { createSampleBookProject } from '@/resources/sampleProject';
import { CoverStyler } from '@/studio/CoverStyler';
import { InnerPocketsStudio } from '@/studio/InnerPocketsStudio';
import { remapStudioForGeometryChange } from '@/studio/studioGeometryRemap';
import { BookParametersModel, type BookParameters } from '@/types/bookParams';
import type { PdfGuideOptionsInput } from '@/types/pdfGuides';
import { BookbinderProjectModel, type BookbinderProject } from '@/types/project';
import { CoverStudioModel, type CoverStudioState } from '@/types/studio';

type WorkspaceTab = 'measure' | 'outer' | 'pockets';

export function App() {
  const [project, setProject] = useState<BookbinderProject>(() => loadProjectFromStorage());
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('outer');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [exportingTarget, setExportingTarget] = useState<'outer-pdf' | 'inner-pdf' | null>(null);

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

  const bindingStrategy = resolveBindingStrategy(project.parameters);
  const usesInnerPockets = bindingStrategy.capabilities.usesInnerPockets;

  const handleParamsChange = (parameters: BookParameters) => {
    const nextStrategy = resolveBindingStrategy(parameters);
    if (
      !nextStrategy.capabilities.usesInnerPockets &&
      bindingStrategy.capabilities.usesInnerPockets &&
      activeTab === 'pockets'
    ) {
      setActiveTab('outer');
    }
    setProject((prev) => {
      const prevGeometry = calculateCaseGeometry(prev.parameters);
      const nextGeometry = calculateCaseGeometry(parameters);
      const studio = remapStudioForGeometryChange(prev.studio, prevGeometry, nextGeometry);
      return {
        ...prev,
        updatedAt: new Date().toISOString(),
        parameters,
        studio,
      };
    });
  };

  const handleStudioChange = (studio: CoverStudioState) => {
    setProject((prev) => ({
      ...prev,
      updatedAt: new Date().toISOString(),
      studio,
    }));
  };

  const handlePatchParams = (patch: Partial<BookParameters>) => {
    handleParamsChange(
      BookParametersModel.clampAndNormalize({ ...project.parameters, ...patch }),
    );
  };

  const handleDownloadOuterSvg = (options?: PdfGuideOptionsInput) => {
    const svg = generateOuterWrapSvg(geometry, project.parameters.splitMode, options);
    const filename =
      project.parameters.splitMode === 'three-piece'
        ? 'outer_case_wrap_3piece.svg'
        : 'outer_case_wrap.svg';
    triggerTextDownload(svg, filename, 'image/svg+xml;charset=utf-8');
    setStatusMessage(`Exported ${filename}`);
  };

  const handleDownloadOuterPdf = async (options?: OuterPdfExportOptions) => {
    setExportingTarget('outer-pdf');
    try {
      const effectiveSplitMode = options?.splitMode ?? project.parameters.splitMode;
      const effectiveMediaId = options?.printMediaId ?? project.parameters.printMedia;
      const bytes = await generateOuterWrapPdf(geometry, effectiveSplitMode, {
        printMediaId: effectiveMediaId,
        tileOverlapMm: options?.tileOverlapMm,
        includeScaleBar: options?.includeScaleBar,
        includeCutLines: options?.includeCutLines,
        includeFoldLines: options?.includeFoldLines,
        includeFoldGuideTicks: options?.includeFoldGuideTicks,
        appendInnerPocketsPage: options?.appendInnerPocketsPage,
        innerPageSizeId: options?.innerPageSizeId ?? project.parameters.pdfPageSize,
        customRollWidthMm: options?.customRollWidthMm ?? project.parameters.customRollWidthMm,
        printerMargins: options?.printerMargins,
        rollNesting: options?.rollNesting,
      });
      const filename =
        effectiveSplitMode === 'three-piece'
          ? 'outer_case_wrap_3piece.pdf'
          : 'outer_case_wrap.pdf';
      triggerBytesDownload(bytes, filename, 'application/pdf');
      setStatusMessage(
        options?.appendInnerPocketsPage
          ? `Exported ${filename} + Detached Pockets`
          : `Exported ${filename}`,
      );
    } catch {
      setStatusMessage('Failed to generate outer wrap PDF.');
    } finally {
      setExportingTarget(null);
    }
  };

  const handleDownloadInnerSvg = () => {
    const svg = generateInnerTemplatesSvg(geometry);
    triggerTextDownload(svg, 'inner_pockets_and_liner.svg', 'image/svg+xml;charset=utf-8');
    setStatusMessage('Exported inner_pockets_and_liner.svg');
  };

  const handleDownloadInnerPdf = async (options?: InnerPdfExportOptions) => {
    setExportingTarget('inner-pdf');
    try {
      const effectivePageSize = options?.pageSizeId ?? project.parameters.pdfPageSize;
      const includeLegend = options?.includeLegend ?? false;
      const { bytes, plan } = await generateInnerTemplatesPdf(
        geometry,
        effectivePageSize,
        {
          includeLegend,
          includeCutLines: options?.includeCutLines,
          includeFoldLines: options?.includeFoldLines,
          includeFoldGuideTicks: options?.includeFoldGuideTicks,
        },
      );
      triggerBytesDownload(bytes, 'inner_pockets_and_liner.pdf', 'application/pdf');
      setStatusMessage(
        `Exported inner_pockets_and_liner.pdf (${plan.pageCount} ${plan.pageCount === 1 ? 'page' : 'pages'}${includeLegend ? ' with legend' : ''})`,
      );
    } catch {
      setStatusMessage('Failed to generate inner templates PDF.');
    } finally {
      setExportingTarget(null);
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

  const handleLoadSampleBook = () => {
    setProject(createSampleBookProject());
    setActiveTab('outer');
    setStatusMessage('Loaded sample book: Twenty Thousand Leagues Under the Seas');
  };

  return (
    <div className="bindery-walnut-desk flex min-h-screen flex-col text-foreground">
      <Header
        statusMessage={statusMessage}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((open) => !open)}
        onLoadSampleBook={handleLoadSampleBook}
      />

      <main
        id="main-workspace"
        tabIndex={-1}
        className={`mx-auto grid w-full max-w-[1760px] flex-1 grid-cols-1 items-start gap-4 px-3 py-3.5 sm:px-5 ${
          sidebarOpen ? 'lg:grid-cols-[276px_minmax(0,1fr)]' : 'lg:grid-cols-1'
        }`}
      >
        {sidebarOpen && (
          <SidebarControls
            params={project.parameters}
            onChange={handleParamsChange}
            onExportJson={handleExportJson}
            onImportJson={handleImportJson}
            onResetDefaults={handleResetDefaults}
          />
        )}

        <div className="flex min-w-0 flex-col">
          {/* 3-Tab Folio Workbench Navigation sitting cleanly above the active workspace */}
          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as WorkspaceTab)}
            className="flex flex-col gap-3"
          >
            <div className="flex flex-wrap items-end justify-between gap-2">
              <TabsList
                aria-label="Workbench modes"
                className="h-auto flex-wrap justify-start gap-1.5 rounded-none bg-transparent p-0"
              >
                <TabsTrigger
                  value="measure"
                  data-testid="nav-measure"
                  className="folio-index-tab px-4 py-2 text-xs font-medium tracking-tight data-[state=active]:shadow-none sm:text-sm"
                >
                  <Ruler className="folio-index-tab-icon h-4 w-4 shrink-0" aria-hidden="true" />
                  Measure &amp; Cut
                </TabsTrigger>
                <TabsTrigger
                  value="outer"
                  data-testid="nav-outer"
                  className="folio-index-tab px-4 py-2 text-xs font-medium tracking-tight data-[state=active]:shadow-none sm:text-sm"
                >
                  <BookMarked
                    className="folio-index-tab-icon h-4 w-4 shrink-0"
                    aria-hidden="true"
                  />
                  Cover Studio
                </TabsTrigger>
                <TabsTrigger
                  value="pockets"
                  data-testid="nav-pockets"
                  className="folio-index-tab px-4 py-2 text-xs font-medium tracking-tight data-[state=active]:shadow-none sm:text-sm"
                >
                  <FolderOpen
                    className={`folio-index-tab-icon h-4 w-4 shrink-0 ${!usesInnerPockets ? 'opacity-65' : ''}`}
                    aria-hidden="true"
                  />
                  <span className={!usesInnerPockets ? 'opacity-75' : undefined}>Inner Pockets</span>
                  {!usesInnerPockets && bindingStrategy.innerPocketsNotice && (
                    <Badge
                      variant="outline"
                      data-testid="pockets-builtin-badge"
                      className="ml-0.5 h-4 px-1.5 font-mono text-[10px]"
                    >
                      {bindingStrategy.innerPocketsNotice.tabBadge}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="measure" className="mt-0">
              <MeasureAndCutPanel
                params={project.parameters}
                geometry={geometry}
                splitMode={project.parameters.splitMode}
                printMediaId={project.parameters.printMedia}
                pageSizeId={project.parameters.pdfPageSize}
                unit={project.parameters.unit}
                bookTitle={project.studio.spineText.title || undefined}
                exportingOuterPdf={exportingTarget === 'outer-pdf'}
                onChangePrintMedia={(printMedia) => handlePatchParams({ printMedia })}
                onChangePageSize={(pdfPageSize) => handlePatchParams({ pdfPageSize })}
                onChangeSplitMode={(splitMode) => handlePatchParams({ splitMode })}
                onReduceFlapWidth={(jacketFlapWidthMm) => handlePatchParams({ jacketFlapWidthMm })}
                onDetachSlipFlaps={() => handlePatchParams({ softcoverPocketMode: 'separate' })}
                onDownloadOuterSvg={handleDownloadOuterSvg}
                onDownloadOuterPdf={handleDownloadOuterPdf}
                onStatusMessage={setStatusMessage}
              />
            </TabsContent>

            <TabsContent value="outer" className="mt-0">
              <CoverStyler
                params={project.parameters}
                geometry={geometry}
                studio={project.studio}
                exportingOuterPdf={exportingTarget === 'outer-pdf'}
                onChange={handleStudioChange}
                onUpdateParams={handlePatchParams}
                onDownloadOuterSvg={handleDownloadOuterSvg}
                onDownloadOuterPdf={handleDownloadOuterPdf}
                onOpenMeasureAndCut={() => setActiveTab('measure')}
                onStatusMessage={setStatusMessage}
              />
            </TabsContent>

            <TabsContent value="pockets" className="mt-0">
              {!usesInnerPockets ? (
                <section
                  aria-label="Inner Pockets Notice"
                  data-testid="pockets-not-needed-notice"
                  className="washi-sheet rounded-md border border-border border-t-2 border-t-vermilion p-6 sm:p-8"
                >
                  <div className="mx-auto flex max-w-xl flex-col items-center text-center">
                    <div className="status-success-surface mb-3 inline-flex h-11 w-11 items-center justify-center rounded-md border">
                      <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <Badge variant="outline" className="mb-2 font-mono text-[10px] uppercase">
                      {bindingStrategy.shortLabel} •{' '}
                      {bindingStrategy.innerPocketsNotice?.tabBadge ?? 'Not Needed'}
                    </Badge>
                    <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">
                      {bindingStrategy.innerPocketsNotice?.heading ??
                        'Separate Inner Pockets Not Needed'}
                    </h2>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {bindingStrategy.innerPocketsNotice?.explanation ??
                        bindingStrategy.materialNote}
                    </p>
                    <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        data-testid="pockets-return-studio-btn"
                        onClick={() => setActiveTab('outer')}
                      >
                        <BookMarked className="h-4 w-4" aria-hidden="true" />
                        Return to Cover Studio
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        data-testid="pockets-switch-flexible-btn"
                        onClick={() =>
                          handleParamsChange(
                            BookParametersModel.clampAndNormalize({
                              ...project.parameters,
                              bindingStyle: 'flexible-spine',
                            }),
                          )
                        }
                      >
                        Switch to Flexible Spine
                      </Button>
                    </div>
                  </div>
                </section>
              ) : (
                <InnerPocketsStudio
                  geometry={geometry}
                  interiorStyle={project.parameters.interiorStyle}
                  pocketStyle={project.studio.pocketStyle}
                  coverMatchColor={project.studio.spineBgColor}
                  pdfPageSize={project.parameters.pdfPageSize}
                  printMediaId={project.parameters.printMedia}
                  unit={project.parameters.unit}
                  exportingInnerPdf={exportingTarget === 'inner-pdf'}
                  onChangeInteriorStyle={(interiorStyle) => handlePatchParams({ interiorStyle })}
                  onChangePocketStyle={(pocketStyle) =>
                    handleStudioChange({ ...project.studio, pocketStyle })
                  }
                  onChangePageSize={(pdfPageSize) => handlePatchParams({ pdfPageSize })}
                  onDownloadInnerSvg={handleDownloadInnerSvg}
                  onDownloadInnerPdf={handleDownloadInnerPdf}
                  onStatusMessage={setStatusMessage}
                />
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}

export default App;
