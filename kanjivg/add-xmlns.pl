#!/home/ben/software/install/bin/perl
use Z;
my @files = <$Bin/kanji/*.svg>;
print scalar @files, "\n";
for my $file (@files) {
    my $text = read_text($file);
    if (! ($text =~ s!(<svg[^>]+)>!$1 xmlns:kvg="https://kanjivg.tagaini.net/">!)) {
	warn "Subs failed for $file";
    }
    write_text($file, $text);
}
exit;
