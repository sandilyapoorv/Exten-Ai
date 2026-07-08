(function exposeRestrictedUrlCheck(globalScope) {
  const restrictedUrlPattern = /^(about:|moz-extension:|chrome:|edge:|view-source:|resource:|file:)/;

  globalScope.extenAiIsRestrictedUrl = function extenAiIsRestrictedUrl(url) {
    return !url || restrictedUrlPattern.test(url);
  };
}(globalThis));
